# A first pass through the tool

A walk through the practice file, in the order the panels are meant to be used.
The practice data is simulated, so the numbers below are not findings about
anyone's opinions. The point is the sequence.

## 1. Load, and look at the weight

Open the practice file. The panel on the left fills in: 2,400 cases, 12
variables, a weight column named `WEIGHT`, an effective sample size of about
1,845, and a design effect of 1.30.

The design effect is the first thing worth understanding. It says that after
weighting, this sample of 2,400 carries about as much information about a
percentage as a simple random sample of 1,845 would. The 555 cases of difference
are the price of correcting a sample that over-represents older and
better-educated respondents.

## 2. Read the codebook before analyzing anything

Every variable, its response options, and how many people are missing on each.

Two things to check on any real file. First, which column is actually the
weight — a file can contain several, one per wave or one per subsample, and
picking the wrong one produces plausible-looking wrong numbers. Second, which
codes mean "refused" rather than an opinion. The tool detects the value `99` in
`solar_local` and lists it in the field for codes to treat as missing.

That choice matters. Seventy-two people refused the local question. Excluded from
the base they affect nothing; counted as opposition they would push local support
down by about three points and inflate the gap.

## 3. One item

Choose `solar_general`. The combined supporting categories come to 78.9%, and
the table shows weighted and unweighted columns side by side. The unweighted
figure is 80.4%.

A point and a half is not a large difference, and on this item it would not
change a conclusion. Try `party` in the same panel to see a case where it
matters more.

## 4. Crosstab

Group `solar_local` by `party`. Weighted row percentages, chi-square of about
334 on 6 degrees of freedom, p below 0.001, Cramér's V of 0.31.

Two numbers doing two different jobs. The chi-square says the differences
between parties are far larger than sampling error would produce. Cramér's V
says how large: 0.31 on a scale where 0 is no association and 1 is perfect. With
a sample this size almost any crosstab will reach significance, so V is usually
the more informative of the two.

## 5. The paired comparison

Set question A to `solar_general`, question B to `solar_local`, and break out by
`urbanicity`.

Check the category assignments first. Both scales run strongly favor, somewhat
favor, somewhat oppose, strongly oppose, and the two favoring options are
assigned to support. The value `99` is excluded. A reversed scale assigned this
way would invert the entire result, so this is the step to slow down on.

The output: 79.3% support solar in general, 64.2% support it where they live, a
gap of 15.1 points. McNemar's chi-square of 119.6, p below 0.001.

The 2×2 figure shows where that comes from. 24.6% of respondents support solar
in general while not supporting it locally; 9.5% do the reverse. The gap is the
difference between those two groups, not between two independent percentages,
which is why the test only looks at the people who answered the two questions
differently.

Broken out by urbanicity, the gap runs 6.3 points in urban areas, 15.7 in
suburban, 25.5 in rural. That pattern — general approval holding steady near 80%
everywhere while local support falls away — is the shape the NIMBY literature
describes.

## 6. What this does not establish

Rural residence is correlated with partisanship, age, and education. The
crosstab panel shows Republicans are much less supportive than Democrats, and
rural areas lean Republican. So some of the rural gap may be a partisan gap
wearing rural clothing.

Separating the two requires holding one constant while varying the other, which
means a regression with survey weights rather than a crosstab. The paired
comparison broken out by party, then by urbanicity within party, gets partway
there and will show the subgroups thinning out fast — the margins of error in the
right-hand column of the group table widen as the groups get smaller.

A bivariate finding is a real finding. It is just a narrower claim than it looks
like, and stating it at its actual width is the difference between a result that
holds up and one that does not.

## Questions worth asking of real data

- Does the gap differ between solar and wind? The practice file has
  `wind_local` for this comparison.
- Do people who already have a solar farm nearby show a smaller gap than those
  who do not? `solar_farm_nearby` is in the practice file; Pew's 2024 wave asks
  a version of this.
- Has the gap widened over time? This needs two waves with both items, stacked
  into one file with a wave column.
- Among people who oppose it locally, what reason do they give? `main_concern`
  in the practice file stands in for the open-ended follow-up.
