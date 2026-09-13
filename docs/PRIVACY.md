# Where your data goes

Short answer: nowhere. It is read by code running inside your own browser and
never transmitted.

This page explains why that is true, how to check it yourself rather than take
anyone's word for it, and what it does *not* protect against.

## Why a web page can read a file without uploading it

The word "upload" is doing a lot of work in most people's mental model of the
web, and it is worth separating two different things a browser can do with a
file you choose.

When you drag a file onto a page, the browser hands the page a reference to
that file. Reading it is a local operation: the JavaScript asks the browser for
the bytes, and the browser reads them off the disk into the memory of that
tab. No part of this involves the network.

Sending the file somewhere is an entirely separate act. It requires the page to
make a deliberate network request with the file attached — an HTTP POST to a
server, or a form submission, or a WebSocket message. A page that never writes
that code cannot transmit anything, in the same way a calculator app cannot
send email.

Survey Workbench never writes that code. There is no server behind it to
receive anything even if it did: the address is a static file host that serves
the page and nothing else.

## What actually crosses the network

Loading the page fetches eight files, all from the same address:

```
GET /index.html
GET /css/style.css
GET /js/stats.js
GET /js/csv.js
GET /js/sav.js
GET /js/regression.js
GET /js/charts.js
GET /js/app.js
```

All are GET requests with empty bodies. That is the whole conversation. After
those finish, the page has everything it needs and stops talking.

Loading a survey file and working through every screen — reading 8,638 records,
building a codebook, running crosstabs, fitting regressions, drawing figures —
produces **zero further network requests**. Nothing is sent, and nothing is
fetched.

The one exception is the "open the practice file" button, which fetches the
made-up teaching file that ships with the tool. That is a GET for a file that
is already public, and it sends nothing.

## Things that are deliberately absent

Several ordinary parts of a modern web page would leak information even without
anyone intending it, so none of them are used:

- **No analytics.** Not Google Analytics, not GoatCounter, nothing. No record
  is kept of who opened the page or what they did on it.
- **No fonts or libraries from a CDN.** A web font or a charting library loaded
  from another domain would tell that domain your IP address and which page you
  were on, every time. Every line of code and every typeface here is either
  bundled or already on your computer.
- **No cookies, no local storage.** Nothing is written to disk and nothing
  persists. Closing the tab is enough to clear it.
- **No form elements.** There is no `<form>` on the page, so there is nothing
  that can submit anywhere.

The charts are drawn as SVG by code in the page rather than rendered by a
service, which is why there is no image request either.

## How to check this yourself

Do not take the above on trust. Two ways to confirm it, both of which take
about a minute.

**Watch the network.** Open the page, press F12 to open developer tools, and
click the Network tab. Load a survey file and use the tool normally. The
request list will show the eight files from the page load and nothing else.
If anything were being sent, it would appear there.

**Read the source.** The whole tool is about 3,800 lines of plain JavaScript
with no build step, so what is served is what was written. Searching all of it
for the ways a browser can send data —

```
fetch(          XMLHttpRequest      sendBeacon
WebSocket       EventSource         <form>
```

— returns exactly one result: the `fetch` that loads the practice file.

**The strongest version.** For data that is genuinely sensitive — an
unpublished survey, anything under an IRB restriction — download the repository,
open `index.html` from your own disk, and turn the wifi off. Everything except
the practice-file button works identically with no network connection at all.
At that point there is no server to leak to even in principle.

## What this does not protect against

An honest account has to include the gaps.

**The code could change.** This describes the version in this repository today.
Anyone who can push to the repository could publish a version that behaves
differently, and you would not be able to tell by looking at the page. The
protection is that the source is readable and the history is public, not that a
promise was made. If you are handling sensitive data and want certainty, use
the downloaded copy rather than the hosted page, so you control which version
you are running.

**Browser extensions can read the page.** An extension with permission to read
page contents can see the data once it is loaded, because it runs inside the
same tab. This is true of every web page, not just this one. For sensitive
data, a private or guest browser window with extensions disabled removes this.

**Your own machine is your own machine.** Nothing here defends against malware,
a shared login, or a laptop left unlocked. The file is on your disk before it
gets anywhere near this tool.

**Figures you save are files.** "Save figure as SVG" writes to your Downloads
folder. That stays local, but it is a real file containing real numbers, so
treat it like any other export.

**The host sees that you visited.** Whoever serves the page — GitHub Pages, in
the hosted version — can log that a request came from your IP address at a
particular time, as any web server can. They cannot see your data, because your
data is never part of any request. They can see that the page was fetched.

## The short version, for a methods section

> Survey data was analysed in Survey Workbench, a client-side browser tool.
> Data files are read locally via the browser's FileReader API and are not
> transmitted; the application makes no network requests after the initial page
> load and uses no analytics, third-party resources, cookies, or persistent
> storage.
