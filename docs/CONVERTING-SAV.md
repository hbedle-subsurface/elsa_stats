# Converting an SPSS file to CSV

Pew Research Center releases its datasets as SPSS `.sav` files. A browser cannot
read those, so one conversion step is needed before a Pew file can be opened in
Survey Workbench. This runs on your own machine and does not send the data
anywhere.

## Install

```
pip install pyreadstat pandas
```

`pyreadstat` reads `.sav` files without SPSS installed, and it can return the
value labels rather than only the numeric codes.

## The script

Save this as `sav_to_csv.py` next to the downloaded `.sav` file.

```python
"""Convert an SPSS .sav file to CSV with value labels."""

import sys
import pandas as pd
import pyreadstat

src = sys.argv[1]
dst = src.rsplit(".", 1)[0] + ".csv"

# apply_value_formats turns the numeric codes into their text labels, so
# a column holds "Strongly favor" rather than 1. The labels are what make
# the file readable in the codebook panel.
df, meta = pyreadstat.read_sav(src, apply_value_formats=True)

df.to_csv(dst, index=False)

print(f"wrote {dst}: {len(df)} rows, {len(df.columns)} columns")

# The codebook: which variable is which question, and what the weight is
# called. Keep this open while working.
print("\nvariable labels")
for name, label in meta.column_names_to_labels.items():
    print(f"  {name:24s} {label}")

weights = [c for c in df.columns if "WEIGHT" in c.upper()]
print(f"\nlikely weight columns: {weights}")
```

Run it:

```
python sav_to_csv.py ATP_W###.sav
```

## Codes versus labels

With `apply_value_formats=True` the answers come out as text, which is what the
tool's scale detection reads. With it set to `False` the answers come out as the
numbers 1, 2, 3, 4, 99 and the tool cannot tell which end of the scale is
support — every category has to be assigned by hand in the "General vs. local"
panel, working from the questionnaire PDF.

Text labels are easier, but the numeric codes are worth looking at once. Pew's
scales are not always in the direction that seems obvious, and a reversed scale
silently inverts a result. The questionnaire released with each wave gives the
authoritative wording and coding.

## Refusal codes

Pew uses 99 for refused and 98 for not asked in many waves; the exact codes are
in each wave's codebook. Survey Workbench detects bare numeric codes in the
90–99 range and flags them as missing on load, but it cannot know a wave's
particular conventions. Check the field labeled "treat these codes as missing"
in the Codebook panel against the wave documentation.

A refusal excluded from the base and a refusal counted as opposition give
different answers, and the difference grows on exactly the items where people
are most reluctant to answer.

## Very large files

A CES common content file is around 60,000 rows and several hundred columns,
which is slow to work with in a browser. Cutting it down first helps:

```python
keep = ["commonweight", "inputstate", "pid7", "birthyr", "educ", "urbancity"]
keep += [c for c in df.columns if c.startswith("CC24_")]
df[keep].to_csv("ces_subset.csv", index=False)
```
