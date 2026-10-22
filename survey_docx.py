"""Export a survey (all questions and instructions, in every language version) as a Word .docx file.

Only the Python standard library is used: a .docx file is a zip archive of XML parts, which are
written here directly. Formatting typed in the builder (**bold**, *italic*, __underline__,
[links](https://…), bullet and numbered lists) becomes real Word formatting.
"""
from __future__ import annotations

import datetime as _dt
import io
import re
import zipfile
from xml.sax.saxutils import escape as _xml_escape

# ---------------------------------------------------------------- labels

TYPE_LABELS = {
    "short_text": "Short text", "long_text": "Open text", "number": "Number", "email": "Email", "phone": "Phone",
    "yes_no": "Yes / No", "single_choice": "Single choice", "multiple_choice": "Multiple choice",
    "photo_choice": "Photo choice", "dropdown": "Dropdown", "rating": "Rating scale", "slider": "Slider",
    "matrix": "Matrix / Likert", "date": "Date", "time": "Time", "datetime": "Date & time",
    "map_multi": "Point map", "map_3d": "3D point map", "map_line": "Line map", "map_polygon": "Polygon map",
    "photo": "Photo", "photos": "Multiple photos", "audio": "Voice recording", "video": "Video", "file": "File upload",
    "signature": "Signature", "ranking": "Ranking", "allocation": "Point allocation", "info": "Information text",
    "section": "Section", "consent": "Consent",
}
LANGUAGE_NAMES = {
    "en": "English", "de": "Deutsch", "fr": "Français", "es": "Español", "it": "Italiano", "nl": "Nederlands",
    "pl": "Polski", "pt": "Português", "tr": "Türkçe", "ar": "العربية", "uk": "Українська", "ru": "Русский",
    "fa": "فارسی", "zh": "中文", "ja": "日本語",
}
YES_NO = {"en": ("Yes", "No"), "de": ("Ja", "Nein"), "fr": ("Oui", "Non"), "es": ("Sí", "No"), "it": ("Sì", "No"),
          "nl": ("Ja", "Nee"), "pl": ("Tak", "Nie"), "pt": ("Sim", "Não"), "tr": ("Evet", "Hayır")}
OPTION_TYPES = {"single_choice", "multiple_choice", "photo_choice", "dropdown", "ranking", "allocation"}
NOT_A_QUESTION = {"section", "info"}

ACCENT = "2F6F5E"
GREY = "7A847F"
LIGHT = "EEF4EF"
BORDER = "C9D3CC"

# ---------------------------------------------------------------- XML helpers


def x(text) -> str:
    return _xml_escape(str(text if text is not None else ""), {'"': "&quot;"})


class Doc:
    """Collects the body XML plus the hyperlinks and list instances it needs."""

    def __init__(self):
        self.body: list[str] = []
        self.links: list[str] = []          # hyperlink targets -> rId (index + 10)
        self.numbered_lists = 0             # each numbered list restarts at 1

    def link_id(self, url: str) -> str:
        self.links.append(url)
        return f"rIdLink{len(self.links)}"

    def new_numbered_list(self) -> int:
        self.numbered_lists += 1
        return 100 + self.numbered_lists     # numId (see numbering part)


def run(text, bold=False, italic=False, underline=False, color=None, size=None, link_style=False) -> str:
    props = []
    if link_style:
        props.append('<w:rStyle w:val="Hyperlink"/>')
    if bold:
        props.append("<w:b/>")
    if italic:
        props.append("<w:i/>")
    if underline:
        props.append('<w:u w:val="single"/>')
    if color:
        props.append(f'<w:color w:val="{color}"/>')
    if size:
        props.append(f'<w:sz w:val="{size}"/><w:szCs w:val="{size}"/>')
    rpr = f"<w:rPr>{''.join(props)}</w:rPr>" if props else ""
    parts = str(text).split("\n")
    out = []
    for i, part in enumerate(parts):
        if i:
            out.append(f"<w:r>{rpr}<w:br/></w:r>")
        if part:
            out.append(f'<w:r>{rpr}<w:t xml:space="preserve">{x(part)}</w:t></w:r>')
    return "".join(out)


INLINE_RE = re.compile(
    r"\[(?P<ltext>[^\]\n]+)\]\((?P<url>[^)\s]+)\)"
    r"|\*\*(?P<b>[^*\n]+)\*\*"
    r"|__(?P<u>[^_\n]+)__"
    r"|(?<![*\w])\*(?P<i>[^*\s][^*\n]*?)\*(?!\*)"
)
SAFE_URL = re.compile(r"^(https?://|mailto:|tel:)", re.I)


def inline_runs(doc: Doc, text: str, base: dict | None = None) -> str:
    """Text with **bold**, *italic*, __underline__ and [links](url) -> Word runs."""
    base = dict(base or {})
    out, pos = [], 0
    text = str(text or "")
    for m in INLINE_RE.finditer(text):
        if m.start() > pos:
            out.append(run(text[pos:m.start()], **base))
        if m.group("ltext"):
            url = m.group("url")
            if not SAFE_URL.match(url) and url.lower().startswith("www."):
                url = "https://" + url
            if SAFE_URL.match(url):
                rid = doc.link_id(url)
                out.append(f'<w:hyperlink r:id="{rid}" w:history="1">{run(m.group("ltext"), **{**base, "link_style": True})}</w:hyperlink>')
            else:
                out.append(run(m.group(0), **base))
        elif m.group("b"):
            out.append(inline_runs(doc, m.group("b"), {**base, "bold": True}))
        elif m.group("u"):
            out.append(inline_runs(doc, m.group("u"), {**base, "underline": True}))
        elif m.group("i"):
            out.append(inline_runs(doc, m.group("i"), {**base, "italic": True}))
        pos = m.end()
    if pos < len(text):
        out.append(run(text[pos:], **base))
    return "".join(out)


def para(content: str, style=None, align=None, space_after=None, keep_next=False, num=None, shade=None) -> str:
    props = []
    if style:
        props.append(f'<w:pStyle w:val="{style}"/>')
    if keep_next:
        props.append("<w:keepNext/>")
    if num:
        props.append(f'<w:numPr><w:ilvl w:val="0"/><w:numId w:val="{num}"/></w:numPr>')
    if shade:
        props.append(f'<w:shd w:val="clear" w:color="auto" w:fill="{shade}"/>')
    if space_after is not None:
        props.append(f'<w:spacing w:after="{space_after}"/>')
    if align:
        props.append(f'<w:jc w:val="{align}"/>')
    ppr = f"<w:pPr>{''.join(props)}</w:pPr>" if props else ""
    return f"<w:p>{ppr}{content}</w:p>"


BULLET_RE = re.compile(r"^\s*(?:[-•]|\*(?!\*))\s+(.*)$")
NUMBER_RE = re.compile(r"^\s*\d{1,3}[.)]\s+(.*)$")


def block_paragraphs(doc: Doc, text: str, style="CellText", base: dict | None = None) -> list[str]:
    """A survey text (may contain line breaks and lists) -> Word paragraphs."""
    paras, buffer, current_num, current_kind = [], [], None, None

    def flush():
        nonlocal buffer
        if buffer:
            paras.append(para(inline_runs(doc, "\n".join(buffer), base), style=style))
            buffer = []

    for line in str(text or "").replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        b, n = BULLET_RE.match(line), (None if BULLET_RE.match(line) else NUMBER_RE.match(line))
        if b or n:
            flush()
            kind = "b" if b else "n"
            if kind != current_kind:
                current_num = 1 if kind == "b" else doc.new_numbered_list()
                current_kind = kind
            paras.append(para(inline_runs(doc, (b or n).group(1), base), style="ListCell", num=current_num))
        else:
            current_kind = None
            if line.strip() == "" and buffer == []:
                continue
            buffer.append(line)
    flush()
    while paras and paras[-1].endswith('<w:pPr><w:pStyle w:val="CellText"/></w:pPr></w:p>'):
        paras.pop()
    return paras


def option_paragraphs(doc: Doc, options, numbered=True) -> list[str]:
    if not options:
        return []
    num = doc.new_numbered_list() if numbered else 1
    return [para(inline_runs(doc, o), style="ListCell", num=num) for o in options]


def missing(text="not translated – participants see the original") -> list[str]:
    return [para(run(f"[{text}]", italic=True, color=GREY), style="CellText")]


# ---------------------------------------------------------------- tables

PAGE_WIDTH = 9638  # A4 portrait minus 2 cm margins, in twentieths of a point


def cell(paragraphs: list[str], width: int, shade=None, span=1, vmerge=None) -> str:
    props = [f'<w:tcW w:w="{width}" w:type="dxa"/>']
    if span > 1:
        props.append(f'<w:gridSpan w:val="{span}"/>')
    if shade:
        props.append(f'<w:shd w:val="clear" w:color="auto" w:fill="{shade}"/>')
    body = "".join(paragraphs) or para("", style="CellText")
    return f"<w:tc><w:tcPr>{''.join(props)}</w:tcPr>{body}</w:tc>"


def table(rows: list[str], widths: list[int]) -> str:
    grid = "".join(f'<w:gridCol w:w="{w}"/>' for w in widths)
    borders = "".join(f'<w:{side} w:val="single" w:sz="4" w:space="0" w:color="{BORDER}"/>'
                      for side in ("top", "left", "bottom", "right", "insideH", "insideV"))
    return (f'<w:tbl><w:tblPr><w:tblW w:w="{sum(widths)}" w:type="dxa"/><w:tblBorders>{borders}</w:tblBorders>'
            f'<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="70" w:type="dxa"/><w:left w:w="110" w:type="dxa"/>'
            f'<w:bottom w:w="70" w:type="dxa"/><w:right w:w="110" w:type="dxa"/></w:tblCellMar></w:tblPr>'
            f"<w:tblGrid>{grid}</w:tblGrid>{''.join(rows)}</w:tbl>")


def row(cells: list[str], header=False, cant_split=True) -> str:
    props = []
    if header:
        props.append("<w:tblHeader/>")
    if cant_split:
        props.append("<w:cantSplit/>")
    trpr = f"<w:trPr>{''.join(props)}</w:trPr>" if props else ""
    return f"<w:tr>{trpr}{''.join(cells)}</w:tr>"


# ---------------------------------------------------------------- survey content


def _lang_list(definition: dict) -> list[str]:
    settings = definition.get("settings") or {}
    main = settings.get("defaultLanguage") or "en"
    codes = [main]
    for item in settings.get("languages") or []:
        code = item.get("code") if isinstance(item, dict) else item
        if code and code not in codes:
            codes.append(code)
    for code in (definition.get("translations") or {}):
        if code not in codes:
            codes.append(code)
    return codes


def _lang_name(definition: dict, code: str) -> str:
    for item in (definition.get("settings") or {}).get("languages") or []:
        if isinstance(item, dict) and item.get("code") == code and item.get("name"):
            return item["name"]
    return LANGUAGE_NAMES.get(code, code.upper())


def build_docx(definition: dict) -> bytes:
    doc = Doc()
    settings = definition.get("settings") or {}
    langs = _lang_list(definition)
    main = langs[0]
    trans = definition.get("translations") or {}
    questions = [q for q in (definition.get("questions") or []) if isinstance(q, dict)]

    def tq(code, qid):  # translation of one question
        return ((trans.get(code) or {}).get("questions") or {}).get(qid) or {}

    def ts(code):  # translation of the survey texts
        return (trans.get(code) or {}).get("survey") or {}

    label_w = 2050
    lang_w = (PAGE_WIDTH - label_w) // len(langs)
    widths = [label_w] + [lang_w] * len(langs)

    def lang_header():
        cells = [cell([para(run("", bold=True), style="CellHead")], label_w, shade=ACCENT)]
        for code in langs:
            name = _lang_name(definition, code) + ("  (main language)" if code == main else "")
            cells.append(cell([para(run(name, bold=True, color="FFFFFF"), style="CellHead")], lang_w, shade=ACCENT))
        return row(cells, header=True)

    def text_row(label, per_lang: list[list[str]]):
        cells = [cell([para(run(label, bold=True), style="CellLabel")], label_w, shade=LIGHT)]
        cells += [cell(p, lang_w) for p in per_lang]
        return row(cells, cant_split=False)

    def shared_row(label, paragraphs):
        return row([cell([para(run(label, bold=True), style="CellLabel")], label_w, shade=LIGHT),
                    cell(paragraphs, lang_w * len(langs), span=len(langs))], cant_split=False)

    def translated_text(original, getter, block=True):
        out = []
        for code in langs:
            value = original if code == main else getter(code)
            if code != main and not str(value or "").strip():
                out.append(missing() if str(original or "").strip() else [para("", style="CellText")])
            else:
                out.append(block_paragraphs(doc, value) if block else [para(inline_runs(doc, value), style="CellText")])
        return out

    def translated_list(original, getter, numbered=True):
        out = []
        for code in langs:
            values = original if code == main else getter(code)
            if code != main and not any(str(v).strip() for v in (values or [])):
                out.append(missing())
            else:
                out.append(option_paragraphs(doc, values or [], numbered))
        return out

    # Question numbers (sections and information texts are not numbered)
    numbers, n = {}, 0
    for q in questions:
        if q.get("type") not in NOT_A_QUESTION:
            n += 1
            numbers[q.get("id")] = n

    def target_name(qid):
        if qid == "__end":
            return "end of survey"
        for q in questions:
            if q.get("id") == qid:
                if q.get("type") == "section":
                    return f"section “{strip(q.get('title') or 'Section')}”"
                if q.get("id") in numbers:
                    return f"Q{numbers[q['id']]}"
                return f"“{strip(q.get('title') or 'information text')}”"
        return "a later question"

    title = definition.get("title") or "Survey"
    body = doc.body

    # ---- cover
    body.append(para(inline_runs(doc, strip(title)), style="Title"))
    for code in langs[1:]:
        other = ts(code).get("title")
        if other:
            body.append(para(run(strip(other), color=GREY, size=30), style="Subtitle"))
    meta = (f"Questionnaire – all questions and instructions · "
            f"{len(numbers)} questions · languages: {', '.join(_lang_name(definition, c) for c in langs)} · "
            f"exported {_dt.date.today().strftime('%d.%m.%Y')}")
    body.append(para(run(meta, color=GREY), style="Meta"))
    if definition.get("slug"):
        body.append(para(run(f"Survey link name: {definition['slug']}", color=GREY), style="Meta"))
    body.append(para(run("How to read this document: each question is shown with its type, whether an answer is required, "
                         "and all language versions side by side. Grey notes in square brackets mark texts that have not "
                         "been translated yet (participants then see the main-language text).", italic=True, color=GREY),
                     style="Meta"))

    # ---- welcome and closing texts
    body.append(para(run("Welcome page and closing text"), style="Heading1"))
    rows = [lang_header(),
            text_row("Survey title", translated_text(title, lambda c: ts(c).get("title"), block=False)),
            text_row("Introduction", translated_text(definition.get("description"), lambda c: ts(c).get("description"))),
            text_row("Thank-you message", translated_text(settings.get("thankYou"), lambda c: ts(c).get("thankYou")))]
    body.append(table(rows, widths))

    # ---- questions
    body.append(para(run("Questions"), style="Heading1"))
    for q in questions:
        qtype = q.get("type") or ""
        c = q.get("config") or {}
        qid = q.get("id")
        type_label = TYPE_LABELS.get(qtype, qtype)

        if qtype == "section":
            body.append(para(run("Section: ", color=ACCENT) + inline_runs(doc, strip(q.get("title") or "Section")), style="Heading2", keep_next=True))
        else:
            head = f"Q{numbers[qid]}. " if qid in numbers else "Information · "
            body.append(para(run(head, color=ACCENT) + inline_runs(doc, strip(q.get("title") or type_label)), style="Heading3", keep_next=True))

        facts = [type_label]
        if qtype not in NOT_A_QUESTION:
            facts.append("required" if q.get("required") else "optional")
        if qtype == "section":
            if c.get("onePage"):
                facts.append("all questions of this section on one page")
            if c.get("hideHeading"):
                facts.append("heading hidden from participants")
        body.append(para(run(" · ".join(facts), color=GREY, size=18), style="Meta", keep_next=True))

        rows = [lang_header(),
                text_row("Section title" if qtype == "section" else ("Text" if qtype == "info" else "Question"),
                         translated_text(q.get("title"), lambda code: tq(code, qid).get("title"), block=False))]
        if str(q.get("description") or "").strip() or any(tq(code, qid).get("description") for code in langs[1:]):
            rows.append(text_row("Instruction / help text",
                                 translated_text(q.get("description"), lambda code: tq(code, qid).get("description"))))

        if qtype in OPTION_TYPES:
            rows.append(text_row("Answer options", translated_list(c.get("options") or [], lambda code: tq(code, qid).get("options"),
                                                                   numbered=qtype != "multiple_choice")))
        if qtype == "yes_no":
            rows.append(text_row("Answer options", [option_paragraphs(doc, list(YES_NO.get(code, YES_NO["en"])), False) for code in langs]))
        if qtype == "matrix":
            rows.append(text_row("Rows (statements)", translated_list(c.get("rows") or [], lambda code: tq(code, qid).get("rows"))))
            rows.append(text_row("Columns (answer scale)", translated_list(c.get("columns") or [], lambda code: tq(code, qid).get("columns"))))
        if qtype == "consent":
            rows.append(text_row("Checkbox text", translated_text(c.get("checkboxLabel") or "I agree",
                                                                  lambda code: tq(code, qid).get("checkboxLabel"), block=False)))
        popup = c.get("popup") or {}
        if qtype.startswith("map_") and popup.get("enabled"):
            rows.append(text_row("Pop-up question after each mark",
                                 translated_text(popup.get("question"), lambda code: tq(code, qid).get("popupQuestion"), block=False)))
            if (popup.get("type") or "single_choice") == "single_choice":
                rows.append(text_row("Pop-up answer options",
                                     translated_list(popup.get("options") or [], lambda code: tq(code, qid).get("popupOptions"))))
            else:
                rows.append(shared_row("Pop-up answer type", [para(run("Rating 1–5" if popup.get("type") == "rating" else "Free text"), style="CellText")]))

        # language-independent settings
        details = []
        if qtype in ("rating", "slider"):
            details.append(f"Scale from {c.get('min', 1 if qtype == 'rating' else 0)} to {c.get('max', 5 if qtype == 'rating' else 100)}"
                           + (f", step {c.get('step')}" if qtype == "slider" and c.get("step") not in (None, "", 1) else ""))
        if qtype == "number" and (c.get("min") not in (None, "") or c.get("max") not in (None, "")):
            details.append(f"Allowed range: {c.get('min', '–')} to {c.get('max', '–')}")
        if qtype in ("map_multi", "map_3d"):
            details.append(f"Participants can mark up to {c.get('maxPoints') or 10} point(s); tapping a point again deletes it")
        if qtype in ("map_line", "map_polygon"):
            kind = "line(s)" if qtype == "map_line" else "area(s)"
            details.append(f"Participants can draw up to {c.get('maxFeatures') or 1} {kind}" +
                           (f", each with up to {c['maxVertices']} corner points" if c.get("maxVertices") else ""))
        if qtype.startswith("map_"):
            if c.get("lat") not in (None, "") and c.get("lng") not in (None, ""):
                details.append(f"Map opens at {float(c['lat']):.4f}° N, {float(c['lng']):.4f}° E, zoom {c.get('zoom', 12)}")
            tools = [t for t, on in (("place search", c.get("allowCitySearch") is not False), ("“use my location”", c.get("allowGeo") is not False)) if on]
            if tools:
                details.append("Tools: " + ", ".join(tools))
        if qtype == "map_3d":
            details.append(f"3D close-up at zoom {c.get('zoom3d') or 17}, tilt {c.get('pitch') or 60}°, background: "
                           + ("street map" if c.get("background") == "map" else "aerial photos"))
        if qtype in ("photo", "photos", "file"):
            details.append(f"Up to {c.get('maxFiles') or 1} file(s)")
        if qtype in ("audio", "video"):
            details.append(f"Up to {c.get('maxDuration') or 180} seconds")
        if qtype == "allocation":
            details.append(f"Total to distribute: {c.get('total') or 100} {c.get('unit') or 'points'}")
        if qtype in ("long_text", "short_text") and c.get("allowVoice"):
            details.append("Participants may also answer with a voice message (up to 3 minutes)")
        if qtype == "ranking":
            details.append("Participants put the options in order (1 = most important)")
        if details:
            rows.append(shared_row("Settings", [para(inline_runs(doc, d), style="ListCell", num=1) for d in details]))

        branches = [b for b in (c.get("branches") or []) if isinstance(b, dict) and b.get("goto")]
        if branches and qtype in ("single_choice", "dropdown", "yes_no"):
            opts = list(YES_NO["en"]) if qtype == "yes_no" else (c.get("options") or [])
            rules = []
            for b in sorted(branches, key=lambda r: r.get("index", 0)):
                i = b.get("index", 0)
                label = opts[i] if isinstance(i, int) and 0 <= i < len(opts) else f"option {i + 1}"
                rules.append(para(run("If “") + inline_runs(doc, strip(label)) + run(f"” → continue with {target_name(b['goto'])}"), style="ListCell", num=1))
            rules.append(para(run("All other answers → next question", color=GREY), style="ListCell", num=1))
            rows.append(shared_row("Skip logic", rules))

        body.append(table(rows, widths))
        body.append(para("", style="Spacer"))

    return _package(doc, strip(title))


def strip(text) -> str:
    s = str(text or "")
    s = re.sub(r"\[([^\]\n]+)\]\(([^)\s]+)\)", r"\1", s)
    s = re.sub(r"\*\*([^*\n]+)\*\*", r"\1", s)
    s = re.sub(r"__([^_\n]+)__", r"\1", s)
    s = re.sub(r"(^|[^*\w])\*([^*\s][^*\n]*?)\*(?!\*)", r"\1\2", s)
    return s


# ---------------------------------------------------------------- package parts

NS = ('xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"')

STYLES = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles {NS}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="en-GB" w:eastAsia="en-GB"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="80"/></w:pPr><w:rPr><w:b/><w:color w:val="1C2C22"/><w:sz w:val="44"/><w:szCs w:val="44"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="120"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="160"/><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="{ACCENT}"/></w:pBdr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="{ACCENT}"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:shd w:val="clear" w:color="auto" w:fill="{LIGHT}"/><w:spacing w:before="320" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="1C2C22"/><w:sz w:val="27"/><w:szCs w:val="27"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="40"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:color w:val="1C2C22"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Meta"><w:name w:val="Meta"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="100"/></w:pPr><w:rPr><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="CellText"><w:name w:val="Cell text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60" w:line="252" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListCell"><w:name w:val="Cell list"/><w:basedOn w:val="CellText"/><w:pPr><w:spacing w:after="30"/><w:ind w:left="300" w:hanging="260"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="CellLabel"><w:name w:val="Cell label"/><w:basedOn w:val="CellText"/><w:rPr><w:color w:val="1C2C22"/><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="CellHead"><w:name w:val="Cell heading"/><w:basedOn w:val="CellText"/><w:pPr><w:spacing w:after="0"/></w:pPr><w:rPr><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Spacer"><w:name w:val="Spacer"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/></w:pPr><w:rPr><w:sz w:val="12"/><w:szCs w:val="12"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="{GREY}"/><w:sz w:val="17"/><w:szCs w:val="17"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="1F6F8B"/><w:u w:val="single"/></w:rPr></w:style>
</w:styles>"""


def _numbering(n_numbered: int) -> str:
    bullet = ('<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/>'
              '<w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="300" w:hanging="260"/></w:pPr>'
              '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr></w:lvl></w:abstractNum>')
    decimal = ('<w:abstractNum w:abstractNumId="2"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/>'
               '<w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="340" w:hanging="300"/></w:pPr></w:lvl></w:abstractNum>')
    nums = ['<w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>']
    for i in range(1, n_numbered + 1):
        nums.append(f'<w:num w:numId="{100 + i}"><w:abstractNumId w:val="2"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>')
    return f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering {NS}>{bullet}{decimal}{"".join(nums)}</w:numbering>'


def _footer(title: str) -> str:
    fld = lambda instr: (f'<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> {instr} </w:instrText></w:r>'
                         f'<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>')
    return (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr {NS}><w:p><w:pPr><w:pStyle w:val="Footer"/>'
            f'<w:tabs><w:tab w:val="right" w:pos="{PAGE_WIDTH}"/></w:tabs></w:pPr>{run(title[:90])}<w:r><w:tab/></w:r>'
            f'{run("Page ")}{fld("PAGE")}{run(" of ")}{fld("NUMPAGES")}</w:p></w:ftr>')


def _package(doc: Doc, title: str) -> bytes:
    sect = ('<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="11906" w:h="16838"/>'
            '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>')
    document = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document {NS}><w:body>'
                f'{"".join(doc.body)}{sect}</w:body></w:document>')
    links = "".join(f'<Relationship Id="rIdLink{i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" '
                    f'Target="{x(url)}" TargetMode="External"/>' for i, url in enumerate(doc.links))
    rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            '<Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>'
            '<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>'
            '<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>'
            f'{links}</Relationships>')
    content_types = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                     '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                     '<Default Extension="xml" ContentType="application/xml"/>'
                     '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
                     '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
                     '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>'
                     '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>'
                     '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'
                     '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
                     '</Types>')
    root_rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                 '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
                 '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
                 '</Relationships>')
    settings = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings {NS}><w:updateFields w:val="true"/>'
                '<w:defaultTabStop w:val="709"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>')
    now = _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    core = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
            'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
            f'<dc:title>{x(title)} – questionnaire</dc:title><dc:creator>Participatory Survey Platform</dc:creator>'
            f'<dcterms:created xsi:type="dcterms:W3CDTF">{now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">{now}</dcterms:modified>'
            '</cp:coreProperties>')
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types)
        z.writestr("_rels/.rels", root_rels)
        z.writestr("docProps/core.xml", core)
        z.writestr("word/document.xml", document)
        z.writestr("word/_rels/document.xml.rels", rels)
        z.writestr("word/styles.xml", STYLES)
        z.writestr("word/numbering.xml", _numbering(doc.numbered_lists))
        z.writestr("word/settings.xml", settings)
        z.writestr("word/footer1.xml", _footer(title))
    return buf.getvalue()
