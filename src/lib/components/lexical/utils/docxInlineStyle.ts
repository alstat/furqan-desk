import { ShadingType, type IRunOptions } from "docx";

function parseStyleString(s: string | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    if (!s) return out;
    for (const decl of s.split(";")) {
        const idx = decl.indexOf(":");
        if (idx < 0) continue;
        const key = decl.slice(0, idx).trim().toLowerCase();
        const val = decl.slice(idx + 1).trim();
        if (key && val) out[key] = val;
    }
    return out;
}

export function cssColorToHex(value: string): string | null {
    const v = value.trim().toLowerCase();
    const m3 = v.match(/^#([0-9a-f]{3})$/);
    if (m3) {
        const r = m3[1][0];
        const g = m3[1][1];
        const b = m3[1][2];
        return (r + r + g + g + b + b).toUpperCase();
    }
    const m6 = v.match(/^#([0-9a-f]{6})$/);
    if (m6) return m6[1].toUpperCase();
    const mrgb = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (mrgb) {
        const hex = (n: number) => n.toString(16).padStart(2, "0");
        return (hex(+mrgb[1]) + hex(+mrgb[2]) + hex(+mrgb[3])).toUpperCase();
    }
    return null;
}

function cssFontSizeToHalfPoints(value: string): number | null {
    const m = value.trim().match(/^(\d+(?:\.\d+)?)(px|pt|em|rem)?$/i);
    if (!m) return null;
    const n = parseFloat(m[1]);
    const unit = (m[2] ?? "px").toLowerCase();
    const pt = unit === "pt" ? n : unit === "px" ? n * 0.75 : n * 12;
    return Math.round(pt * 2);
}

function cssFontFamily(value: string): string | undefined {
    const first = value.split(",")[0]?.trim();
    if (!first) return undefined;
    return first.replace(/^['"]|['"]$/g, "");
}

export function textRunStyleFromNode(
    style: string | undefined,
    defaultColor?: string,
): Partial<IRunOptions> {
    const css = parseStyleString(style);
    const color = css["color"] ? cssColorToHex(css["color"]) : (defaultColor ?? null);
    const bg = css["background-color"]
        ? cssColorToHex(css["background-color"])
        : null;
    const fontFamily = css["font-family"]
        ? cssFontFamily(css["font-family"])
        : undefined;
    const fontSize = css["font-size"]
        ? cssFontSizeToHalfPoints(css["font-size"])
        : null;
    return {
        ...(color ? { color } : {}),
        ...(fontFamily ? { font: fontFamily } : {}),
        ...(fontSize !== null ? { size: fontSize } : {}),
        ...(bg
            ? { shading: { type: ShadingType.CLEAR, color: "auto", fill: bg } }
            : {}),
    };
}
