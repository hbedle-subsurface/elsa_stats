# Survey Workbench

A browser tool for weighted analysis of public opinion survey data, built for
undergraduate research on attitudes toward solar power and other energy
technologies.

The tool reads a delimited data file, shows what is in it, and produces
weighted percentages, crosstabs, and a paired comparison between support for a
technology in general and support for it locally.

**Everything runs in the browser.** There is no server, no upload step, and no
analytics. A survey file dropped into the page is read by JavaScript running on
the machine in front of you and does not leave it. This holds for unpublished or
confidential survey data as well as for public datasets.

## Running it

Open `index.html` in a browser. That is the whole installation.

Two things need a local web server rather than a `file://` URL: the "open the
synthetic practice file" button, and any other file the page fetches for itself.
Dragging a file onto the drop area works either way. To serve the folder:

```
cd survey-workbench
python3 -m http.server 8000
```

then open `http://localhost:8000`.

## The five panels

**Load data** takes a `.csv`, `.tsv`, or other delimited file. The delimiter is
detected automatically. Quoted fields, commas inside quotes, and both line-ending
conventions are handled.

**Codebook** lists every variable with its response categories, how many people
gave each answer, and how many are missing. The survey weight is set here. Codes
that stand for refusals or non-answers are detected on load and listed in the
"treat as missing" field, where they can be changed.

**One item** shows a single question weighted and unweighted side by side, with
the shift between them. For an ordered scale it also reports the combined
supporting categories — the number that normally gets quoted — with a confidence
interval computed by collapsing the categories at the respondent level.

**Who answers how** takes one question and breaks it out across every
background variable at once, on a single shared scale with the whole-sample
figure marked. A group whose interval overlaps that line is drawn hollow,
because the survey cannot tell it apart from the average; the filled dots are
the differences worth writing about. This is usually the right first look at a
new question.

**Crosstab** breaks a question out by a grouping variable as weighted row
percentages, with a design-adjusted chi-square test and Cramér's V.

**General vs. local** is the paired comparison. Two questions answered by the
same people, each collapsed into support or not support, with the resulting 2×2
table, the difference between the two percentages, McNemar's test, and the same
comparison run separately within any third variable.

**Regression** fits a survey-weighted model of a yes/no outcome, either a
linear probability model or a logistic one, with design-based standard errors.
This is the panel that separates confounded differences: rural residents are
less supportive of a local project and rural areas also lean Republican, and
only a model with both predictors in it can say how much of the rural
difference is rural. Output includes a coefficient plot and adjusted
predictions, neither of which Pew publishes.

## Where to get data

### Pew Research Center

Run `tools/make_dictionary.py` on the downloaded `.sav` first. It writes the CSV
and a dictionary of question wording and answer labels, so the tool can name
variables by what was asked instead of by column name. See
`docs/PEW-ATP-NOTES.md`.

Free, but requires a Pew account and agreement to their terms and conditions.
Datasets are SPSS `.sav` files, which a browser cannot read directly; see
`docs/CONVERTING-SAV.md` for the conversion.

The waves most relevant to energy attitudes:

- **May 13–19, 2024** (8,638 adults). Asks about expanding solar and wind
  nationally *and* about wind and solar development at the local level, in the
  same respondents. This is the wave to use for a general-versus-local
  comparison, because the paired structure is what makes the comparison
  possible.
- **April 28 – May 4, 2025** (Wave 169, climate and energy).
- **March 2026** (3,524 adults). The most recent energy wave.

The same item wording — whether the respondent favors more solar panel farms —
has been carried since 2016, so the waves stack into a trend.

Public Pew files identify geography only down to Census region and division.
There is no state variable. "West South Central" covers Oklahoma, Texas,
Arkansas, and Louisiana.

Pew's terms restrict redistribution, so a Pew microdata file should not be
committed into a public repository.

`docs/PEW-ATP-NOTES.md` records what Wave 148 turned out to look like in
practice: numeric codes rather than answer text, refusals kept in the
percentage base, form splits that halve the sample, and which local solar items
the wave actually contains.

### Cooperative Election Study

`https://cces.gov.harvard.edu` — distributed on the Harvard Dataverse as CSV,
free with a Dataverse account. Around 60,000 respondents per year, and it
carries state identifiers, which makes state-level subgroups possible in a way
that Pew's public files do not. Oklahoma alone runs several hundred respondents.

### General Social Survey

`https://gss.norc.org` — free, no registration, and the longest-running
environmental attitude series in the United States, though thin on solar
specifically.

## Method notes

Variance estimation uses Kish's effective sample size, which treats unequal
weights as the only departure from simple random sampling. It does not account
for clustering or stratification. `docs/METHODS.md` sets out every formula the
tool uses and where each one is approximate.

## Colors

The palette lives entirely in `css/style.css`, including the chart colors, which
`js/charts.js` reads as CSS custom properties. Changing `--c-support-1` and its
neighbors restyles every figure in the tool.

Support runs through greens and opposition through warm earth tones rather than
green against blue. Green and blue sit on the axis that red-green color
blindness affects; green against ochre separates on the blue-yellow axis and
stays readable under deuteranopia and protanopia.

## License

Licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

The practice file in `data/` is simulated. It is shaped like a real survey
extract so the controls can be learned before real data arrives, and the
general-to-local gap in it was put there deliberately. None of its numbers
estimate anything about actual public opinion.
