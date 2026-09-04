//! Backs the Workbook's `data` node: a reader picks a local CSV/XLSX file,
//! `import_data_file` parses it and writes a fresh, standalone SQLite file
//! under the app's data directory (one file per node, named by node id, so a
//! re-upload just overwrites its own file rather than accumulating). The
//! Workbook's own pipeline (Filter/Limit/Dedupe/View, same as the Qur'an
//! nodes) reads the table back in through `read_data_table`; a Julia node
//! wired to the same `data` node is handed the `.sqlite` file's path
//! directly (see `runWorkbookJulia` in workbook-code-nodes.ts) so a reader
//! with SQLite.jl/DataFrames.jl installed can query it with real SQL — the
//! app itself never runs SQL beyond `SELECT * FROM data`.
use calamine::{open_workbook_auto, Data as CellData, Reader};
use rusqlite::types::ValueRef;
use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Every imported file lands in one table by this name, so the rest of the
/// app never needs to know or guess a table name — just the `.sqlite` path.
const TABLE_NAME: &str = "data";

/// Column headers plus row-major cells, all still plain text (or absent) —
/// the shared shape `read_source_file`'s two format-specific readers return,
/// before `infer_column_types` decides what each column actually is.
type RawGrid = (Vec<String>, Vec<Vec<Option<String>>>);

#[derive(Serialize, Clone)]
pub struct DataColumn {
    pub name: String,
    /// The SQLite storage class actually used for this column —
    /// `"INTEGER"`, `"REAL"`, or `"TEXT"` — decided once at import time by
    /// scanning every value (see `infer_column_types`).
    #[serde(rename = "type")]
    pub kind: String,
}

#[derive(Serialize)]
pub struct DataImportResult {
    pub sqlite_path: String,
    pub table_name: String,
    pub columns: Vec<DataColumn>,
    pub row_count: i64,
}

#[derive(Serialize)]
pub struct DataTable {
    pub columns: Vec<DataColumn>,
    /// Row-major; each cell already carries its column's SQLite storage
    /// class, so the frontend needs no further coercion.
    pub rows: Vec<Vec<serde_json::Value>>,
}

fn workbook_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("workbook-data");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// One .sqlite file per Data node, named by that node's own id — a
/// re-upload overwrites its own file in place rather than leaking a new one
/// every time, and two Data nodes never collide.
fn sqlite_path_for(app: &AppHandle, node_id: &str) -> Result<PathBuf, String> {
    Ok(workbook_data_dir(app)?.join(format!("{node_id}.sqlite")))
}

/// Reads every cell of a CSV/XLSX file into a plain string grid — headers
/// plus rows, nothing typed yet. Column typing happens once, after every
/// value in a column has been seen, in `infer_column_types`.
fn read_source_file(path: &Path) -> Result<RawGrid, String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    match ext.as_str() {
        "csv" => read_delimited(path, b','),
        "tsv" => read_delimited(path, b'\t'),
        "xlsx" | "xls" | "xlsm" | "xlsb" | "ods" => read_spreadsheet(path),
        other => Err(format!(
            "Unsupported file type: .{other} — only CSV and XLSX (or .tsv/.xls/.ods) are supported."
        )),
    }
}

fn read_delimited(path: &Path, delimiter: u8) -> Result<RawGrid, String> {
    let mut reader = csv::ReaderBuilder::new()
        .delimiter(delimiter)
        .flexible(true)
        .from_path(path)
        .map_err(|e| format!("Could not read {}: {e}", path.display()))?;
    let headers = reader
        .headers()
        .map_err(|e| e.to_string())?
        .iter()
        .map(|s| s.to_string())
        .collect::<Vec<_>>();
    let mut rows = Vec::new();
    for record in reader.records() {
        let record = record.map_err(|e| e.to_string())?;
        rows.push(
            record
                .iter()
                .map(|cell| if cell.is_empty() { None } else { Some(cell.to_string()) })
                .collect(),
        );
    }
    Ok((headers, rows))
}

fn cell_to_text(cell: &CellData) -> Option<String> {
    match cell {
        CellData::Empty => None,
        CellData::String(s) => {
            if s.is_empty() {
                None
            } else {
                Some(s.clone())
            }
        }
        CellData::Int(i) => Some(i.to_string()),
        CellData::Float(f) => Some(format_spreadsheet_float(*f)),
        CellData::Bool(b) => Some(b.to_string()),
        CellData::DateTimeIso(s) | CellData::DurationIso(s) => Some(s.clone()),
        CellData::DateTime(dt) => {
            // No `chrono` feature enabled (this app avoids the extra
            // dependency for one formatting convenience), so build the
            // string by hand from the plain (y, m, d, h, m, s, ms) tuple.
            let (y, mo, d, h, mi, s, _ms) = dt.to_ymd_hms_milli();
            Some(if dt.is_duration() {
                format!("{h:02}:{mi:02}:{s:02}")
            } else {
                format!("{y:04}-{mo:02}-{d:02} {h:02}:{mi:02}:{s:02}")
            })
        }
        CellData::Error(e) => Some(format!("#ERROR: {e:?}")),
    }
}

/// Excel stores every number as `f64`, including values that were typed as
/// whole numbers — printing those as `"3"` rather than `"3.0"` keeps a
/// spreadsheet's integer-looking column recognized as INTEGER by
/// `infer_column_types` instead of drifting to REAL.
fn format_spreadsheet_float(f: f64) -> String {
    if f.fract() == 0.0 && f.abs() < 1e15 {
        format!("{}", f as i64)
    } else {
        f.to_string()
    }
}

fn read_spreadsheet(path: &Path) -> Result<RawGrid, String> {
    let mut workbook = open_workbook_auto(path).map_err(|e| format!("Could not read {}: {e}", path.display()))?;
    let sheet_name = workbook
        .sheet_names()
        .into_iter()
        .next()
        .ok_or_else(|| "The spreadsheet has no sheets.".to_string())?;
    let range = workbook
        .worksheet_range(&sheet_name)
        .map_err(|e| format!("Could not read sheet '{sheet_name}': {e}"))?;
    let mut rows_iter = range.rows();
    let headers: Vec<String> = rows_iter
        .next()
        .map(|row| {
            row.iter()
                .enumerate()
                .map(|(i, cell)| cell_to_text(cell).unwrap_or_else(|| format!("column_{}", i + 1)))
                .collect()
        })
        .unwrap_or_default();
    let rows = rows_iter
        .map(|row| row.iter().map(cell_to_text).collect())
        .collect();
    Ok((headers, rows))
}

/// Header names as they came from the file are shown to the reader and used
/// as SQL column names (always double-quoted, so spaces/punctuation are
/// fine) — only blank or repeated names need fixing up here.
fn clean_headers(raw: &[String], width: usize) -> Vec<String> {
    let mut seen: HashSet<String> = HashSet::new();
    let mut out = Vec::with_capacity(width);
    for i in 0..width {
        let base = raw
            .get(i)
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| format!("column_{}", i + 1));
        let mut name = base.clone();
        let mut n = 2;
        while !seen.insert(name.clone()) {
            name = format!("{base}_{n}");
            n += 1;
        }
        out.push(name);
    }
    out
}

fn looks_like_integer(s: &str) -> bool {
    let s = s.trim();
    !s.is_empty() && s.parse::<i64>().is_ok()
}

fn looks_like_real(s: &str) -> bool {
    let s = s.trim();
    !s.is_empty() && s.parse::<f64>().is_ok()
}

/// A column is INTEGER only if every value that appears in it parses as one;
/// REAL if every value at least parses as a number; otherwise TEXT. A column
/// with no non-empty values at all defaults to TEXT.
fn infer_column_types(width: usize, rows: &[Vec<Option<String>>]) -> Vec<&'static str> {
    let mut types = vec!["INTEGER"; width];
    for row in rows {
        for (i, kind) in types.iter_mut().enumerate() {
            let Some(Some(value)) = row.get(i) else { continue };
            if *kind == "TEXT" {
                continue;
            }
            if *kind == "INTEGER" && !looks_like_integer(value) {
                *kind = if looks_like_real(value) { "REAL" } else { "TEXT" };
            } else if *kind == "REAL" && !looks_like_real(value) {
                *kind = "TEXT";
            }
        }
    }
    types
}

fn create_and_fill(
    conn: &rusqlite::Connection,
    headers: &[String],
    types: &[&'static str],
    rows: &[Vec<Option<String>>],
) -> Result<(), String> {
    let columns_sql = headers
        .iter()
        .zip(types)
        .map(|(name, kind)| format!("\"{}\" {kind}", name.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(", ");
    conn.execute(
        &format!("CREATE TABLE \"{TABLE_NAME}\" ({columns_sql})"),
        [],
    )
    .map_err(|e| e.to_string())?;

    let placeholders = headers.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let column_names = headers
        .iter()
        .map(|n| format!("\"{}\"", n.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(", ");
    let insert_sql = format!("INSERT INTO \"{TABLE_NAME}\" ({column_names}) VALUES ({placeholders})");

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    {
        let mut stmt = tx.prepare(&insert_sql).map_err(|e| e.to_string())?;
        for row in rows {
            let values: Vec<rusqlite::types::Value> = (0..headers.len())
                .map(|i| match row.get(i).and_then(|c| c.as_deref()) {
                    None => rusqlite::types::Value::Null,
                    Some(raw) => match types[i] {
                        "INTEGER" => raw
                            .trim()
                            .parse::<i64>()
                            .map(rusqlite::types::Value::Integer)
                            .unwrap_or(rusqlite::types::Value::Null),
                        "REAL" => raw
                            .trim()
                            .parse::<f64>()
                            .map(rusqlite::types::Value::Real)
                            .unwrap_or(rusqlite::types::Value::Null),
                        _ => rusqlite::types::Value::Text(raw.to_string()),
                    },
                })
                .collect();
            stmt.execute(rusqlite::params_from_iter(values))
                .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// Parses `path` (CSV or XLSX) and writes it out as a fresh `.sqlite` file
/// dedicated to `node_id`, replacing whatever that node imported before.
#[tauri::command]
pub fn import_data_file(app: AppHandle, node_id: String, path: String) -> Result<DataImportResult, String> {
    let source = Path::new(&path);
    let (raw_headers, raw_rows) = read_source_file(source)?;
    let width = raw_rows
        .iter()
        .map(|r| r.len())
        .max()
        .unwrap_or(raw_headers.len())
        .max(raw_headers.len());
    if width == 0 {
        return Err("The file has no columns.".to_string());
    }
    let headers = clean_headers(&raw_headers, width);
    let types = infer_column_types(width, &raw_rows);

    let db_path = sqlite_path_for(&app, &node_id)?;
    let _ = std::fs::remove_file(&db_path);
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    create_and_fill(&conn, &headers, &types, &raw_rows)?;

    Ok(DataImportResult {
        sqlite_path: db_path.to_string_lossy().to_string(),
        table_name: TABLE_NAME.to_string(),
        columns: headers
            .into_iter()
            .zip(types)
            .map(|(name, kind)| DataColumn {
                name,
                kind: kind.to_string(),
            })
            .collect(),
        row_count: raw_rows.len() as i64,
    })
}

/// Reads a `.sqlite` file back in full — used both to feed the Workbook
/// pipeline (Filter/Limit/Dedupe/View operate on these rows in memory, same
/// as the Qur'an nodes) and to redisplay a Data node's own summary after the
/// board is reopened, without re-parsing the original CSV/XLSX.
#[tauri::command]
pub fn read_data_table(sqlite_path: String) -> Result<DataTable, String> {
    let conn = rusqlite::Connection::open(&sqlite_path).map_err(|e| e.to_string())?;

    let mut info_stmt = conn
        .prepare(&format!("PRAGMA table_info(\"{TABLE_NAME}\")"))
        .map_err(|e| e.to_string())?;
    let columns: Vec<DataColumn> = info_stmt
        .query_map([], |row| {
            Ok(DataColumn {
                name: row.get::<_, String>(1)?,
                kind: row.get::<_, String>(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    if columns.is_empty() {
        return Err(format!("'{TABLE_NAME}' table not found in {sqlite_path}"));
    }

    let select_sql = format!("SELECT * FROM \"{TABLE_NAME}\"");
    let mut stmt = conn.prepare(&select_sql).map_err(|e| e.to_string())?;
    let width = columns.len();
    let rows = stmt
        .query_map([], |row| {
            (0..width)
                .map(|i| {
                    Ok(match row.get_ref(i)? {
                        ValueRef::Null => serde_json::Value::Null,
                        ValueRef::Integer(n) => serde_json::Value::from(n),
                        ValueRef::Real(f) => serde_json::json!(f),
                        ValueRef::Text(t) => serde_json::Value::String(String::from_utf8_lossy(t).into_owned()),
                        ValueRef::Blob(_) => serde_json::Value::Null,
                    })
                })
                .collect::<rusqlite::Result<Vec<_>>>()
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(DataTable { columns, rows })
}
