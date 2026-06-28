//! Online reference lookup by identifier (DOI / PMID / ISBN / arXiv).
//!
//! Each provider returns a different payload; we normalize all of them into the
//! shared [`Reference`] shape that the frontend renders as cards and serializes
//! back to BibTeX. Lookups run here (not in the webview) to avoid CORS and to
//! reuse the existing `reqwest` client.

use std::collections::HashMap;

use quick_xml::events::Event;
use quick_xml::Reader;
use serde::Serialize;
use serde_json::Value;

const USER_AGENT: &str =
    "AyahLab/0.1 (https://ayahlab.com; reference manager) reqwest";

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Reference {
    pub id: String,
    pub cite_key: String,
    pub kind: String,
    pub title: String,
    pub authors: Vec<String>,
    pub year: String,
    pub container: String,
    pub doi: String,
    pub url: String,
    pub identifier: String,
    pub extra: HashMap<String, String>,
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))
}

/// Resolve a single identifier to a normalized reference.
///
/// `kind` is one of "doi", "pmid", "isbn", "arxiv" (decided on the frontend by
/// `detectIdKind`). `id` is the bare identifier.
#[tauri::command]
pub async fn fetch_reference(kind: String, id: String) -> Result<Reference, String> {
    let id = id.trim().to_string();
    if id.is_empty() {
        return Err("Empty identifier".into());
    }
    let mut reference = match kind.as_str() {
        "doi" => fetch_doi(&id).await,
        "pmid" => fetch_pmid(&id).await,
        "isbn" => fetch_isbn(&id).await,
        "arxiv" => fetch_arxiv(&id).await,
        other => Err(format!("Unsupported identifier type: {other}")),
    }?;
    reference.identifier = id;
    Ok(reference)
}

// ── DOI → Crossref ─────────────────────────────────────────────────────────
async fn fetch_doi(doi: &str) -> Result<Reference, String> {
    let url = format!("https://api.crossref.org/works/{}", urlencode_path(doi));
    let resp = client()?
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("DOI not found (HTTP {})", resp.status()));
    }
    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Crossref response: {e}"))?;
    let msg = &body["message"];

    let mut r = Reference::default();
    r.kind = match msg["type"].as_str().unwrap_or("") {
        "journal-article" => "article",
        "book" | "monograph" => "book",
        "proceedings-article" => "inproceedings",
        "book-chapter" => "incollection",
        "report" => "techreport",
        _ => "misc",
    }
    .to_string();
    r.title = first_string(&msg["title"]).unwrap_or_default();
    r.authors = msg["author"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|a| {
                    let family = a["family"].as_str().unwrap_or("");
                    let given = a["given"].as_str().unwrap_or("");
                    if family.is_empty() && given.is_empty() {
                        a["name"].as_str().map(|s| s.to_string())
                    } else if given.is_empty() {
                        Some(family.to_string())
                    } else {
                        Some(format!("{family}, {given}"))
                    }
                })
                .collect()
        })
        .unwrap_or_default();
    r.year = crossref_year(msg);
    r.container = first_string(&msg["container-title"])
        .or_else(|| first_string(&msg["publisher"]))
        .unwrap_or_default();
    r.doi = msg["DOI"].as_str().unwrap_or(doi).to_string();
    r.url = msg["URL"].as_str().unwrap_or("").to_string();
    Ok(r)
}

fn crossref_year(msg: &Value) -> String {
    for key in ["published-print", "published-online", "issued", "created"] {
        if let Some(parts) = msg[key]["date-parts"][0].as_array() {
            if let Some(y) = parts.first().and_then(|v| v.as_i64()) {
                return y.to_string();
            }
        }
    }
    String::new()
}

// ── PMID → NCBI eutils ─────────────────────────────────────────────────────
async fn fetch_pmid(pmid: &str) -> Result<Reference, String> {
    let url = format!(
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id={pmid}&retmode=json"
    );
    let resp = client()?
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("PMID lookup failed (HTTP {})", resp.status()));
    }
    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse PubMed response: {e}"))?;
    let doc = &body["result"][pmid];
    if doc.is_null() {
        return Err("PMID not found".into());
    }
    let mut r = Reference::default();
    r.kind = "article".to_string();
    r.title = doc["title"]
        .as_str()
        .unwrap_or("")
        .trim_end_matches('.')
        .to_string();
    r.authors = doc["authors"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|a| a["name"].as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    r.year = doc["pubdate"]
        .as_str()
        .and_then(|d| d.split_whitespace().next())
        .unwrap_or("")
        .to_string();
    r.container = doc["fulljournalname"]
        .as_str()
        .or_else(|| doc["source"].as_str())
        .unwrap_or("")
        .to_string();
    // DOI may appear in articleids.
    if let Some(ids) = doc["articleids"].as_array() {
        for idv in ids {
            if idv["idtype"].as_str() == Some("doi") {
                r.doi = idv["value"].as_str().unwrap_or("").to_string();
            }
        }
    }
    r.extra.insert("pmid".to_string(), pmid.to_string());
    Ok(r)
}

// ── ISBN → OpenLibrary ─────────────────────────────────────────────────────
async fn fetch_isbn(isbn: &str) -> Result<Reference, String> {
    let url = format!(
        "https://openlibrary.org/api/books?bibkeys=ISBN:{isbn}&format=json&jscmd=data"
    );
    let resp = client()?
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("ISBN lookup failed (HTTP {})", resp.status()));
    }
    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse OpenLibrary response: {e}"))?;
    let doc = &body[format!("ISBN:{isbn}")];
    if doc.is_null() {
        return Err("ISBN not found".into());
    }
    let mut r = Reference::default();
    r.kind = "book".to_string();
    r.title = doc["title"].as_str().unwrap_or("").to_string();
    if let Some(sub) = doc["subtitle"].as_str() {
        if !sub.is_empty() {
            r.title = format!("{}: {sub}", r.title);
        }
    }
    r.authors = doc["authors"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|a| a["name"].as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    r.year = doc["publish_date"]
        .as_str()
        .map(|d| {
            d.chars()
                .rev()
                .take_while(|c| c.is_ascii_digit())
                .collect::<String>()
                .chars()
                .rev()
                .collect()
        })
        .unwrap_or_default();
    r.container = doc["publishers"]
        .as_array()
        .and_then(|arr| arr.iter().find_map(|p| p["name"].as_str()))
        .unwrap_or("")
        .to_string();
    r.url = doc["url"].as_str().unwrap_or("").to_string();
    r.extra.insert("isbn".to_string(), isbn.to_string());
    Ok(r)
}

// ── arXiv → Atom feed ──────────────────────────────────────────────────────
async fn fetch_arxiv(arxiv_id: &str) -> Result<Reference, String> {
    let id = arxiv_id.trim_start_matches("arXiv:").trim_start_matches("arxiv:");
    let url = format!("http://export.arxiv.org/api/query?id_list={id}");
    let resp = client()?
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("arXiv lookup failed (HTTP {})", resp.status()));
    }
    let xml = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read arXiv response: {e}"))?;
    parse_arxiv_atom(&xml, id)
}

fn parse_arxiv_atom(xml: &str, id: &str) -> Result<Reference, String> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut r = Reference::default();
    r.kind = "article".to_string();
    r.container = "arXiv".to_string();

    // Path tracking: we only read fields inside the first <entry>.
    let mut in_entry = false;
    let mut in_author = false;
    let mut path: Vec<String> = Vec::new();
    let mut buf = Vec::new();
    let mut found_entry = false;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name = local_name(e.name().as_ref());
                match name.as_str() {
                    "entry" => {
                        in_entry = true;
                        found_entry = true;
                    }
                    "author" if in_entry => in_author = true,
                    _ => {}
                }
                path.push(name);
            }
            Ok(Event::End(e)) => {
                let name = local_name(e.name().as_ref());
                if name == "entry" {
                    in_entry = false;
                }
                if name == "author" {
                    in_author = false;
                }
                path.pop();
            }
            Ok(Event::Text(e)) => {
                if !in_entry {
                    continue;
                }
                let text = e.unescape().unwrap_or_default().to_string();
                if text.trim().is_empty() {
                    continue;
                }
                match path.last().map(|s| s.as_str()) {
                    Some("title") => r.title.push_str(text.trim()),
                    Some("name") if in_author => r.authors.push(text.trim().to_string()),
                    Some("published") if r.year.is_empty() => {
                        r.year = text.chars().take(4).collect();
                    }
                    Some("doi") => r.doi = text.trim().to_string(),
                    _ => {}
                }
            }
            Ok(Event::Empty(e)) => {
                // <link href="…"/> and <arxiv:doi> may be empty-with-attrs.
                if in_entry && local_name(e.name().as_ref()) == "link" {
                    for attr in e.attributes().flatten() {
                        if attr.key.as_ref() == b"href" {
                            let href = String::from_utf8_lossy(&attr.value).to_string();
                            if r.url.is_empty() {
                                r.url = href;
                            }
                        }
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("Failed to parse arXiv XML: {e}")),
            _ => {}
        }
        buf.clear();
    }

    if !found_entry || r.title.trim().is_empty() {
        return Err("arXiv entry not found".into());
    }
    r.title = r.title.split_whitespace().collect::<Vec<_>>().join(" ");
    if r.url.is_empty() {
        r.url = format!("https://arxiv.org/abs/{id}");
    }
    r.extra.insert("eprint".to_string(), id.to_string());
    r.extra.insert("archiveprefix".to_string(), "arXiv".to_string());
    Ok(r)
}

// ── helpers ────────────────────────────────────────────────────────────────
fn first_string(v: &Value) -> Option<String> {
    match v {
        Value::String(s) if !s.is_empty() => Some(s.clone()),
        Value::Array(arr) => arr.iter().find_map(|x| x.as_str()).map(|s| s.to_string()),
        _ => None,
    }
}

fn local_name(qname: &[u8]) -> String {
    let s = String::from_utf8_lossy(qname);
    match s.rsplit(':').next() {
        Some(local) => local.to_string(),
        None => s.to_string(),
    }
}

/// Percent-encode a DOI for safe placement in a URL path (DOIs may contain
/// characters like `<`, `>`, spaces…). Slashes are kept as path separators.
fn urlencode_path(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}
