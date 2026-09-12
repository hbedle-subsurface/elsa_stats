# Methods

Every quantity the tool reports, and where each one is approximate. All of it
lives in `js/stats.js`, which is short enough to read alongside this file.

## Weights

A survey weight is a number attached to each respondent saying how many people
in the population that respondent stands for. Samples are not self-weighting:
the people who agree to join a panel and answer a questionnaire differ from the
population in age, education, race, and partisanship, and the weight is what
corrects for that difference.

A weighted proportion is

    p = Σ wᵢ xᵢ / Σ wᵢ

where xᵢ is 1 if respondent i gave the answer and 0 otherwise. With every weight
equal to 1 this reduces to the unweighted proportion.

The practical consequence is that an unweighted percentage from a panel survey
describes the panel and not the country. In the practice file, weighting moves
some categories by more than a point; in real data the shift on a partisan item
can exceed five.

## Effective sample size

Unequal weights make an estimate less precise than the raw case count suggests,
because the answers of heavily weighted respondents carry more influence.
Kish's effective sample size measures how much:

    n_eff = (Σ wᵢ)² / Σ wᵢ²

    deff = n / n_eff

With equal weights, n_eff equals n and the design effect is 1. A design effect
of 1.3 means a sample of 2,400 carries about as much information about a
percentage as a simple random sample of 1,845.

**Where this is approximate.** Kish's formula treats unequal weighting as the
only departure from simple random sampling. Real sample designs also cluster
(several respondents drawn from the same primary sampling unit, whose answers
resemble each other) and stratify (which usually helps precision). Clustering
inflates true variance beyond what this formula captures, so intervals reported
here are narrower than the correct ones for a clustered design.

Both the American Trends Panel and the CES release a single weight column
without cluster or stratum identifiers, so this is the best available
approximation for those files and the standard one in applied work. A file that
does ship design variables deserves a proper survey package — `survey` in R or
`svy` in Stata.

## Confidence intervals on a proportion

    SE(p) = √( p(1 − p) / n_eff )

    95% interval = p ± 1.96 × SE(p)

The interval uses the normal approximation, which is reliable when n_eff × p and
n_eff × (1 − p) both exceed about 10 and degrades for percentages near 0 or 100.
For a proportion of 0.02 on a small subgroup, an exact or Wilson interval would
be better.

## Combining categories

Reporting "82% favor" from a four-point scale means combining "strongly favor"
and "somewhat favor". The tool does this at the respondent level: each case is
recoded to 1 or 0 first, then the proportion and its interval are computed once.

Adding the two categories' separate intervals together gives the wrong answer.
The two categories are perfectly negatively dependent within a respondent —
anyone in one is necessarily not in the other — so their errors partly cancel,
and the combined interval is narrower than the sum of the parts.

## Chi-square test of independence

The tool computes Pearson's chi-square on the weighted table after rescaling it
so the grand total equals n_eff rather than the sum of the weights:

    χ² = Σ (O − E)² / E,    df = (r − 1)(c − 1)

This is the first-order Rao–Scott correction: dividing the naive weighted
chi-square by the design effect. Running the test on raw weighted counts instead
would treat the sum of the weights as a sample size and produce a wildly
inflated statistic.

**Where this is approximate.** The full Rao–Scott correction uses a
second-order adjustment based on the variances of the individual cell
proportions, not a single overall design effect. The version here is the common
first-order approximation.

The test is unreliable when any expected cell count falls below about 5. The
tool checks for this and says so when it happens; the remedy is combining
categories.

Cramér's V rescales the statistic into a 0-to-1 measure of association:

    V = √( χ² / (n_eff × min(r − 1, c − 1)) )

A significant chi-square with a V of 0.05 describes a real but tiny difference.
With a large survey, almost any cross-tabulation reaches significance, so V is
usually the more informative of the two.

Row-level intervals in the crosstab approximate each row's effective sample size
as that row's case count divided by the overall design effect, rather than
recomputing Kish's formula within the row. Rows whose weights are unusual will
have slightly wrong intervals.

## The paired comparison

Two questions asked of the same respondents produce two percentages that are
correlated, because the same person contributes to both. A two-sample test
treats them as independent and overstates the uncertainty in their difference,
sometimes badly.

Sorting respondents by both answers gives a 2×2 table:

|                        | favors locally | opposes locally |
|------------------------|----------------|-----------------|
| **favors in general**  | a              | b               |
| **opposes in general** | c              | d               |

The two marginal proportions are (a+b)/n and (a+c)/n. Their difference depends
only on the discordant cells b and c — the people who answered the two
questions differently. The concordant cells cancel.

McNemar's test asks whether the discordant cells are lopsided:

    χ² = (|b − c| − 1)² / (b + c),    df = 1

with the −1 as a continuity correction. The tool applies this to the weighted
cells rescaled to n_eff, and reports when b + c is small enough (under about 10
effective cases) that the test should not be trusted.

The interval on the difference between the two correlated proportions uses

    var(d) = ( p_b + p_c − (p_b − p_c)² ) / n_eff

where p_b and p_c are the discordant cells as proportions of the total.

## What the tool does not do

No regression, no multivariate control, no post-stratification. A finding here
that support falls further in rural areas is a bivariate finding, and rural
residence is correlated with partisanship, age, and education. Separating those
influences needs a logistic regression with survey weights, which means R or
Stata.

Neither does it test a hypothesis chosen after looking at the data. Running the
paired comparison across every grouping variable in a file and reporting the
subgroup with the largest gap will produce a significant result eventually
whether or not anything is there.

## Regression

Two models are available, both fitted with the survey weights.

### Linear probability model

A 0/1 outcome regressed by weighted least squares:

    β = (X'WX)⁻¹ X'Wy

Coefficients are changes in the probability of the outcome, so an estimate of
−0.222 means the group is 22.2 percentage points less likely to give that
answer than the reference group, with the other predictors held constant. This
is the same unit the rest of the tool reports, which is why it is the default.

Its known weakness is that nothing constrains a prediction to the 0-to-1
interval, so an unusual combination of predictors can produce a fitted
probability below 0 or above 1. Refitting as logistic is the check on whether
that matters for a particular model.

### Logistic regression

Fitted by iteratively reweighted least squares. Coefficients are log odds
ratios, which nobody has intuitions about, so the tool reports an average
marginal effect alongside each one: the mean change in predicted probability
from setting that indicator to 1 for every case versus 0 for every case, other
predictors left at their observed values. Standard errors for those effects come
from the delta method on the same covariance matrix.

### Standard errors

Both models use a design-based sandwich estimator:

    V = A⁻¹ ( Σ wᵢ² sᵢ sᵢ' ) A⁻¹

where sᵢ is case i's score contribution and A is the weighted information
matrix. For a design with unequal weights and no clustering this is the standard
design-based estimator and matches what a survey package reports.

Using the ordinary model-based standard errors instead would treat the weights
as frequencies and understate the uncertainty, sometimes by a large factor.

**Where this is approximate.** As with the simpler statistics above, the
estimator accounts for unequal weighting but not for clustering or
stratification. A finite population correction is not applied.

### Missing data

Listwise deletion: a case missing on the outcome or on any included predictor is
dropped from the model. Adding a predictor with many refusals therefore shrinks
the sample, and the reported case count is the number actually used. Two models
with different predictor sets are fitted on different samples and are not
strictly comparable.

### Reference categories

A categorical predictor enters as one indicator per category except the
reference, whose effect is absorbed into the intercept. Changing the reference
changes how every coefficient in that variable reads but not what the model
says: the predictions are identical either way.

### What the tool still does not do

No interaction terms, so it cannot ask whether the rural effect differs by
party — only whether each holds with the other held constant. No ordered
logistic for the full four-point scale, no multinomial, no multilevel model, no
post-stratification of its own. Each of those is a reason to move to R or Stata
rather than something to work around here.
