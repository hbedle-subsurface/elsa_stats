"""Turn an SPSS .sav survey file into the two files Survey Workbench reads:

    <name>.csv              the data
    <name>_dictionary.json  the question text and value labels

Run it once per wave. Everything after that is point-and-click.

    pip install pyreadstat
    python make_dictionary.py ATP_W148.sav

The dictionary is not survey data. It holds question wording and answer
labels, both of which are already public in the questionnaire PDF, so it can
be committed to a repository or emailed to a collaborator even when the data
file cannot.
"""

import json
import re
import sys
import os

try:
    import pyreadstat
except ImportError:
    sys.exit("pyreadstat is not installed. Run: pip install pyreadstat")


REFUSAL_PATTERN = re.compile(
    r"^\s*(refused|refusal|no answer|dk\b|don'?t know|dk/refused|"
    r"dk/ref|missing|not asked|skipped)", re.I)


def clean_question(varname, raw):
    """Pew writes the variable name into its own label, and separates the item
    text from the question stem with a double slash:

        ENV2_d_W148. More solar panel "farms" // Do you favor or oppose
        expanding each of the following sources of energy in our country?

    Return a short label for chart titles and the full question for context.
    """
    if not raw:
        return varname, ""

    text = str(raw).strip()
    text = re.sub(r"^\s*" + re.escape(varname) + r"\s*[.:]\s*", "", text)
    text = text.replace("\u201c", "").replace("\u201d", "").replace('"', "")
    text = re.sub(r"\s+", " ", text).strip()

    if "//" in text:
        item, stem = text.split("//", 1)
        short = item.strip()
        full = stem.strip() + "  \u2014  " + short
    else:
        short = text
        full = text
        if len(short) > 70:
            short = short[:67].rstrip() + "\u2026"

    return short or varname, full


def build(path):
    base = os.path.splitext(path)[0]

    print("reading %s ..." % path)
    df, meta = pyreadstat.read_sav(path, apply_value_formats=False)

    # pyreadstat returns every numeric column as float, so a code of 1 would
    # be written as "1.0" and would no longer match the "1" in the dictionary.
    # Columns whose values are all whole numbers are written back as integers.
    for col in df.columns:
        s = df[col]
        if s.dtype.kind == "f":
            nonnull = s.dropna()
            if len(nonnull) and (nonnull % 1 == 0).all():
                df[col] = s.astype("Int64")

    csv_path = base + ".csv"
    df.to_csv(csv_path, index=False)
    print("wrote %s: %d rows, %d columns" % (csv_path, len(df), len(df.columns)))

    dictionary = {}
    weights = []

    for name in meta.column_names:
        short, full = clean_question(name, meta.column_names_to_labels.get(name))

        labels = {}
        refusals = []
        for code, label in (meta.variable_value_labels.get(name) or {}).items():
            # SPSS stores codes as floats; 1.0 has to become "1" to match the CSV
            key = str(int(code)) if float(code).is_integer() else str(code)
            labels[key] = str(label)
            if REFUSAL_PATTERN.match(str(label)):
                refusals.append(key)

        entry = {"short": short}
        if full and full != short:
            entry["question"] = full
        if labels:
            entry["labels"] = labels
        if refusals:
            entry["refusals"] = refusals

        dictionary[name] = entry

        if "WEIGHT" in name.upper():
            weights.append(name)

    dict_path = base + "_dictionary.json"
    with open(dict_path, "w", encoding="utf-8") as fh:
        json.dump(dictionary, fh, indent=1, ensure_ascii=False)

    labeled = sum(1 for e in dictionary.values() if e.get("labels"))
    flagged = sorted({c for e in dictionary.values() for c in e.get("refusals", [])})

    print("wrote %s" % dict_path)
    print("  %d variables, %d of them with value labels" % (len(dictionary), labeled))
    print("  refusal codes found: %s" % (", ".join(flagged) or "none"))
    print("  weight column(s): %s" % (", ".join(weights) or "none found"))
    print("\nLoad the CSV into Survey Workbench, then load the dictionary from")
    print("the Codebook tab. Question wording and answer labels appear everywhere.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: python make_dictionary.py SURVEY.sav")
    build(sys.argv[1])
