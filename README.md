# Solar siting in the news

A crawler that collects news coverage of solar projects meeting local opposition, and a
page for reading and coding what it finds.

Live at **https://hbedle-subsurface.github.io/elsa_doc/**

It runs itself every Monday. Nobody has to install anything, register for anything, or
open a terminal.

---

## How it works

The fetching cannot happen in the browser. GDELT and Google News send no CORS headers, so
a page served from github.io is blocked from calling them. Instead:

```
GitHub Actions  ──  collect/collect.py  ──  data/articles.json  ──  index.html
 (weekly, or a         queries GDELT           committed to           reads it from
  button press)        and Google News         this repository        the same origin
```

Everything the crawler needs is in the Python standard library, and neither source needs
an API key, so there is nothing in repository secrets and nothing to renew.

### Running it now

1. **Actions** tab → **Collect news** → **Run workflow**.
2. Leave the boxes blank for the usual eight states and the last thirty days, or fill
   them in to run something narrower.
3. Four or five minutes. The run summary says how many searches went out, how many
   articles were new, and which searches had trouble.

**The weekly run is not optional if you want an archive.** GDELT's index reaches back
about three months and Google News about one. Coverage from a month nobody collected
cannot be recovered later.

---

## What it searches

`collect/queries.json` holds the whole search, and it is the only file that needs editing
to change what gets collected.

Three topics. **Siting and opposition** is run once per state, pairing solar phrases with
the words that show up when a project is contested — moratorium, zoning, hearing, setback,
petition. **Agrivoltaics** and **canals and reservoirs** are run nationally, because the
volume is low enough that splitting them by state would mostly return nothing.

Each topic has two vocabularies, which matters:

- `subjects` are what gets searched for.
- `recognize` is the wider set used to judge whether a result belongs. A headline may say
  "reservoir solar" when the search asked for "floating solar", and an article about an
  ordinary solar farm often arrives through the floating solar search. Judging results
  against only the phrase that found them throws away good material and mislabels the
  rest.

### What gets set aside

A search for "solar farm" in Texas also returns module prices, earnings reports and
listicles. Each result is scored: a topic phrase in the headline is worth 2, each
opposition word 1 up to 2, a named county 1, a named state 1. Below 2 it is marked
off-topic and hidden, not deleted — there is a filter in the left rail for looking at what
is being thrown away, which is worth doing occasionally to check the threshold is not too
harsh.

### States, stated and inferred

A state named in the headline is a fact about the article. The state whose search returned
it is a reasonable guess, and local headlines usually name a county rather than a state, so
the guess does most of the work. The two are stored in separate fields and exported in
separate columns. The interface shows the guess as "likely Texas" rather than "Texas".

---

## Reading and coding

Only the **headline, outlet, date and link** are stored. No article text is copied. So the
page is a reading list: open the article, read it, come back and code it.

Filter down the left by state, topic, date, outlet, and how far you have got. Every active
filter shows as a removable chip above the results, with *Clear all*.

Open an article and the categories whose words appear in the headline are offered first,
with the remaining ones folding open underneath. Headlines are short, so these suggestions
miss most of what an article contains — the panel says so, and the counts in the right
column switch from headline matches to your own codes as soon as you confirm any.

Arrow keys move between articles, escape goes back. Articles you have opened are marked
read.

### Changing the categories

`codebook.json` holds them, read by both the crawler and the page so there is only one
copy. Copy a block to add one. `id` becomes the exported column name, so changing an id
after coding has started orphans that column.

### What comes out

| Button | File | One row per |
|---|---|---|
| Your coding, as a table | `coded_articles_<date>.csv` | article in the current filter, with one 1/0 column per category |
| The reading list | `reading_list_<date>.csv` | article in the current filter |
| Back up your work | `coding_backup_<date>.json` | — |

Coding lives in the browser, because a page on GitHub Pages cannot write back to the
repository. Back it up before switching machines. Committing the backup file into the
repository is a reasonable way to keep it safe.

If two people code the same fifty articles independently and both export, comparing the
two tables gives an inter-coder agreement figure. Worth doing before coding the rest.

---

## Files

```
.github/workflows/collect.yml   the weekly run and the Run workflow button
collect/collect.py              the crawler; standard library only
collect/queries.json            states, phrases, scoring thresholds
codebook.json                   the concern categories
index.html                      the page and its styling
app.js                          filtering, reading, coding, exporting
data/articles.json              what has been collected; written by the workflow
data/runs.json                  a log of each run
```

Publish with Pages set to the `main` branch, root folder. The page needs a web server —
opening `index.html` from the file system will not work, because a browser will not read
the data files from a `file://` address.

---

## Testing a change without waiting for Monday

```
python3 collect/collect.py --dry-run                  # print the searches, fetch nothing
python3 collect/collect.py --states Oklahoma --days 7 # one state, one week
python3 -m http.server                                # then open localhost:8000
```

---

## Credit

Article metadata comes from the [GDELT Project](https://www.gdeltproject.org) and Google
News. Coverage belongs to the outlets that published it; this repository stores links, not
articles.

Built for undergraduate research on public response to solar development in the
south-central states, at the University of Oklahoma.

## License

Creative Commons Attribution-ShareAlike 4.0 International. See `LICENSE`.
