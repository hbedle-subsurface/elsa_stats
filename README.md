# Survey Workbench

A tool for looking at what people actually say when you ask them.

Public opinion surveys are one of the main ways we know anything about what a
country thinks. Someone asks thousands of people the same question, and the
answers, added up carefully, tell you something you could not have learned by
asking your friends. This tool lets you open one of those surveys and look
at it yourself, instead of reading someone else's summary of it.

You do not need to know how to code. You do not need to install anything. You
open a page in your browser, drag a survey file onto it, and start asking
questions.

---

**Open it here:** <https://hbedle-subsurface.github.io/elsa_stats/>

Nothing to install. The page runs on your own computer and no data you open
ever leaves it.

## Why this exists

Suppose you want to know how Americans feel about solar power.

You could read a news article about it. The article will tell you a number,
maybe that 78% of people favor building more solar farms. That is useful, but
it is one number, and someone else chose it. It cannot tell you whether young
people and older people disagree, whether that has changed, or whether people
who say they support solar in general also want one built near them.

The organizations that run these surveys — Pew Research Center is the best
known — publish their raw data for free. Every person's answers, every
question, for anyone to examine. Almost nobody outside of professional
researchers ever opens these files, because the software for reading them is
expensive and the files themselves look forbidding.

They are not actually that forbidding. That is what this tool is for.

---

## Getting a survey

Go to `pewresearch.org`, find a report on a topic you care about, and look for
the link to download the dataset. You will need to make a free account.

You will get a folder with several files in it:

| file | what it is |
|---|---|
| something**.sav** | **the data.** Every person's answers. This is the one you want |
| something**.csv** | the same data, but stripped of the labels — usable, but harder |
| **Questionnaire**.pdf | exactly what each person was asked, word for word |
| **Codebook**.xlsx | a list of every question and its possible answers |
| **Methodology**.pdf | who was surveyed and how |

Open the questionnaire first and read it. It is the survey itself, and you
cannot interpret an answer without knowing the question that produced it. It
is worth twenty minutes.

---

## Using the tool

Go to <https://hbedle-subsurface.github.io/elsa_stats/> and drag the `.sav`
file onto the page. (Or, if you have the files on your own machine, open
`index.html` in a browser — it works the same either way.)

Everything happens on your own computer. The file is not uploaded anywhere,
there is no server behind this, and no one can see what you are looking at.
That also means a survey you have not published yet — your own, or one shared
with you in confidence — is safe to open here.

That claim is worth being able to check rather than believe.
`docs/PRIVACY.md` explains exactly what does and does not cross the network,
how to verify it yourself in about a minute with the browser's own tools, and
what it does not protect against.

There are eight tabs, meant to be used roughly in order. Once you pick a
question on one of them, the others stay on that same question, so you can
look at it several ways without hunting for it again. Every question menu has
a filter box above it — type `solar` and only the solar questions remain.

### Load data

Drag the file in. A survey of eight thousand people takes a few seconds to
read.

### Codebook

A list of every question in the survey, how many people answered it, and what
the possible answers were.

Two things live here that matter more than they sound like they do.

**The survey weight.** Find it, and check that it is set. There is more about
why below.

**Refusals.** Some people decline to answer. The tool counts them in the total
by default, because that is how Pew calculates the numbers it publishes, so
your figures will match theirs.

### One item

Pick a question and see how everyone answered it. The exact wording and every
answer option people could choose are shown above the numbers, because a
percentage means nothing without them: "45% said not too much" is meaningless
until you know the question was about common ground between the parties.

This screen shows two columns of percentages side by side: the raw count, and
the count after weighting. Look at the gap between them. That gap is the
survey correcting itself, and seeing it once explains weighting better than any
description.

### Finding a question

There are often two hundred questions in a survey and they have names like
`ENV2_d_W148`. The search box on the left searches the *questions themselves*
and their answer options, not those names. Type `solar` and you get every
question that mentions solar anywhere in its wording. Type `solar local` and
you get only the ones about both.

Click any result and it opens on whatever screen you are on.

### Compare a list

Surveys rarely ask about one thing. They ask the same question about a whole
list, and the interesting answer is usually the ranking.

Wave 148 asked *"Do you favor or oppose expanding each of the following sources
of energy in our country?"* and then named six: solar, wind, nuclear, offshore
drilling, fracking, coal. Asked one at a time those are six separate numbers.
On one chart they answer a better question — which sources do Americans
actually want more of, and in what order? (Solar first at 78%, coal last at
39%.)

This screen finds those lists on its own and draws one as soon as you pick it.
The questions in the list are named under the menu so you can see what you are
about to compare.

Add a group and each row gets a dot per group instead. The Wave 148 energy list
split by party is worth looking at: Republicans and Democrats rank the six
sources in almost opposite orders, Republicans putting offshore drilling top
and wind last. Where two dots sit on top of each other the groups agree; where
their error lines overlap, they are not far enough apart to call a difference.

If you want to count a different answer — people who *oppose*, say, rather than
favor — that control is below the chart.

### Who answers how

**This is usually where to start.** Pick one question, and it splits the
answers across age, party, education, where people live, and gender, all at
once, all on the same scale.

The splits it shows are the chips under "Break out by." Click the &times; on
one to drop it, click a suggestion to add one, or search for anything else in
the survey to split by instead.

**Choosing the answer to count.** Under the question you will see every
possible answer with a dropdown. Set the one you care about to *count these
people*. Leave the rest as *counts as someone else* — they stay in the total,
which is what makes the percentage mean something.

*Leave these people out* is for refusals and questions that did not apply. If
you leave everything out except the answer you are counting, the percentage
becomes "out of the people who said X, how many said X", which is always near
100% and never a finding. The tool now tells you the exact total it is dividing
by, right under the dropdowns. Read that line before you trust a number.

One feature is worth understanding before you read the picture. Each group is
a dot. Some dots are solid colored and some are hollow grey. **A hollow dot
means the survey cannot actually tell that group apart from the average.**
Surveys are estimates, not censuses, and a three-point difference between two
groups of four hundred people each might be nothing but the luck of who
happened to pick up the phone. The tool works out which differences are big
enough to trust and draws only those in color.

If you write about a hollow dot as though it were a finding, you are reporting
noise. The chart is trying to stop you.

### Crosstab

The same comparison as a table of numbers, for when you want exact figures to
quote. Each row is a group and adds across to 100%. The screen explains the
two statistics underneath it.

The chart underneath is labelled with both questions: a title saying which
question is broken out by which, and a legend naming every answer the colours
stand for. Blues run through the agreeing answers and greens through the
disagreeing ones when the answers have an order; when they do not, each answer
gets its own distinct colour instead, because a graded ramp would imply an
order that is not there.

There is a **Combine categories** panel here. Give two answers the same name
and they merge into one column: four scale points become favor against oppose,
or a category with too few people folds into its neighbour. Only the table
changes; the data underneath is untouched.

### General vs. local

Some surveys ask people about something in general and also about that same
thing where they live. People often answer those two differently — broadly in
favor of wind farms, less keen on one going up down the road. Researchers call
this NIMBY, for "not in my back yard."

Comparing those two answers needs a particular kind of test, because they came
from the same people rather than from two separate groups. This tab does that
properly.

### Regression

The one that takes real thought, and the one with vocabulary attached. The
**dependent variable** is what you are trying to explain. The **independent
variables** are the things that might explain it.

Before the results it runs a set of checks — whether the outcome is too
lopsided to model, whether there are enough people for the number of things
being estimated, how many were dropped for missing answers, whether any
category is too thin, whether two independent variables are duplicating each
other, and whether the weight is set. Read those first. A model can produce
confident-looking numbers from data that cannot support them.

The results come as a table with the standard columns — coefficient, standard
error, t, and P>|t| — and as a bar chart colored by p-value. **Look at p
first.** Below 0.05 is the usual threshold; a bar that crosses the zero line
has not shown a difference however long it looks. Then look at the size, because
in a survey of thousands a difference can be statistically significant and still
too small to matter.

**Adjusted predictions** turn the model back into ordinary percentages. They
answer: if everyone in the survey were rural, but kept their real age, party
and education, what share would the model expect to agree? Doing that for each
category puts them on equal footing. A tick shows the plain unadjusted
percentage beside it, and where the two are far apart, the raw difference was
partly something else.

Here is the problem it solves. Say rural people are less supportive of a local
solar farm than city people. Rural areas also lean Republican, and Republicans
are less supportive too. So is what you are seeing about *rural*, or about
*Republican* wearing a rural disguise? A table cannot separate those. This can.

---

## Saving figures

Every chart has a **Save figure as SVG** button. The saved file carries its own
title, the wording of the question it came from, which answer is being counted,
and a line naming the data file and whether it was weighted.

That is deliberate. A chart pulled into a poster or a slide leaves the
surrounding page behind, and a reader should not have to ask what they are
looking at. If a figure cannot be understood on its own, it is not finished.

SVG opens in PowerPoint, Word, Illustrator and Inkscape, and stays sharp at any
size.

## The one idea you actually have to understand

**Survey weights.**

A survey does not reach a perfect miniature of the country. Some people are
easier to reach and likelier to answer, so a raw sample usually ends up older,
more educated, and less representative than it should be.

The people running the survey know this, and they correct it. They work out
how many people each respondent should stand for, and attach that number to
them. A twenty-year-old who is hard to reach might count for two people; a
retiree who answers everything might count for half of one. That number is the
**weight**.

Percentages calculated without the weights describe *the people who answered
the survey*. Percentages calculated with them describe *the country*. It is
the second one you want, essentially always.

The panel on the left of the screen shows the weighting status at all times,
and turns orange if no weight is set. If it is orange, do not write down any
number you see.

### A second idea, once the first one is comfortable

Look at the panel on the left again. For a real Pew survey it might say
**8,638 cases** but **effective n 4,126**.

Weighting costs you something. When some people count for more than others,
the survey carries less information than the raw headcount suggests. That
second number is the honest one: this survey of 8,638 people tells you about
as much as a perfect survey of 4,126 would.

That is why the tool shows a margin of error — the little ± next to every
percentage. A figure of 78% with a margin of 1.5 means the true number is
probably somewhere between 76.5% and 79.5%. It does not mean 78%.

---

## What this tool will not do

It will not tell you that something causes something else. Surveys record what
people say at one moment. If supporters of solar power are younger, that is a
pattern, not a mechanism, and it does not tell you that getting older makes
people dislike solar.

It will not rescue a question that was asked badly, and it will not tell you
that the question you are treating as a measure of one thing is really a
measure of something else. Only reading the questionnaire does that.

It will not stop you from testing forty things and reporting the one that came
out interesting. If you look hard enough at any survey, some group will differ
from some other group by chance alone. Decide what you are looking for before
you look.

---

## If you get stuck

- `docs/FIRST-ANALYSIS.md` walks through the practice file step by step.
- `docs/PEW-ATP-NOTES.md` covers the quirks of Pew's files specifically.
- `docs/METHODS.md` gives the formula behind every number, and says where each
  one is approximate.
- `docs/PRIVACY.md` explains why your data never leaves your computer, and how
  to check that for yourself.
- `docs/README-technical.md` is the version of this page for people who want
  the implementation details.

There is a practice file built in — a made-up survey about solar power, with
a pattern deliberately hidden in it. Nothing in it is real, so it is a safe
place to press every button and see what happens. The link is on the Load
screen.

---

Licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Use
it, change it, teach with it; keep the same license on anything you build from
it.
