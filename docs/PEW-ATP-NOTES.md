# Working with a Pew ATP file

Notes from loading Wave 148 (May 13-19, 2024, n=8,638) into this tool.

## The CSV holds codes, not answers

Pew ships both a `.sav` and a `.csv`. The CSV stores numeric codes:
`ENV2_d_W148` contains 1 and 2, not Favor and Oppose. Nothing in the file says
which is which.

Two ways to deal with this:

1. Convert the `.sav` with `apply_value_formats=True` (see
   `CONVERTING-SAV.md`), which writes the answer text into the CSV.
2. Load the CSV as-is and type the labels into the Codebook panel, reading them
   off the questionnaire PDF. Labels can be saved to a JSON file and reloaded,
   so a wave only has to be labeled once and the file can be shared with
   collaborators. It contains no respondent data.

The label file looks like this:

```json
{
  "ENV2_d_W148": {"1": "Favor", "2": "Oppose", "99": "Refused"},
  "F_USR_SELFID": {"1": "Urban", "2": "Suburban", "3": "Rural", "99": "Refused"}
}
```

Until a variable is labeled, the tool cannot tell which end of its scale is
support, and every response option starts excluded rather than being guessed at.

## Refusals stay in the base

Pew computes its published percentages with refusals in the denominator.
Checked against Wave 148:

| item | refusals in base | refusals dropped | Pew published |
|---|---|---|---|
| more solar panel farms | 77.9% | 79.4% | 78% |
| more wind turbine farms | 72.1% | 73.7% | 72% |
| more nuclear power plants | 56.2% | 58.0% | 56% |

Keeping them in reproduces all three exactly. Dropping them raises every figure
by one and a half to two points, which is enough to make an undergraduate
report disagree with the source it cites. The tool therefore counts refusals in
the base by default, with a switch in the Codebook panel for the other
convention.

## Refusal codes are not uniform

Most variables use 99. But `F_PARTYSUM_FINAL` uses **9** for no answer, which
is an ordinary category code elsewhere in the file, so no automatic rule can
catch it. `F_CDIVISION` uses 1 through 9 as real categories and has no refusal
code at all, only blanks. Check each variable's codes against the codebook
spreadsheet rather than trusting the detection.

## The design effect is large

Wave 148 weights run from 0.045 to 8.55. Kish's effective sample size is 4,126
against 8,638 actual cases, a design effect of 2.09. The margin of error that
follows is plus or minus 1.5 points, which is exactly what Pew publishes in the
methodology PDF for this wave.

The practical meaning: this survey carries about as much information as a simple
random sample of 4,100, not 8,600. Treating the raw case count as the sample
size would make every interval about 30% too narrow.

## Form splits cut the sample in half

Many items are asked of only one randomly assigned half of the sample. In Wave
148, `FORM_W148` splits the file into 4,315 and 4,323 cases. The local solar
items are Form 1 only; the matching wind items are Form 2 only.

A Form 1 item therefore has an effective sample of about 2,054 and a margin of
error of plus or minus 2.2 points. Blank cells for the other form are read as
missing by the tool and drop out of the base automatically, so the counts come
out right, but the widened interval has to be reported.

This also means **a solar item and a wind item from this wave cannot be compared
within the same respondents.** No one was asked both.

## What Wave 148 does and does not ask about local solar

This matters for a project on local opposition, because the wave does not
contain a local-support item.

Asked of everyone:

- `ENV2_d` favor or oppose expanding more solar panel farms **in our country**
- `SLRCOMMON_d` how common large solar farms are **in your community**, an
  exposure measure rather than an attitude
- `EN1` / `EN2` energy priorities

Asked of Form 1 only, and phrased as expected consequences rather than support:

- `COMMSOLR_a` a local farm would make the landscape unattractive
- `COMMSOLR_b` would take up too much space
- `COMMSOLR_c` would bring in tax revenue
- `COMMSOLR_d` would lower the price you pay for electricity
- `GRNECON1` would help or hurt your local economy

So the comparison available in this wave is national support against expected
local consequences, not national support against local support. Those are
different quantities. A respondent can favor solar nationally, expect a local
farm to be unattractive, and still welcome one being built; the wave cannot
distinguish that person from an opponent.

Stated carefully, the available finding is: among people who favor expanding
solar nationally, 37% still expect a local farm to make the landscape
unattractive. That is a real tension and it is worth reporting. It is not a
measurement of NIMBY opposition, and calling it one would not survive review.

A genuine local-support item would have to come from elsewhere: a wave that asks
it directly, the Yale county-level modeled estimates, or a survey Elsa fields
herself in the south-central states.
