# Scrub notes

The published copy differs from the run copy only in environment handling: storage mount, secret lookup and download helpers were replaced by local equivalents. The optimizer, controllers and guard are unchanged.

Each line below names a cell (index in the notebook, counting markdown cells) and what was changed. Original lines are described, not quoted.

Notebook metadata was reduced to the kernel specification and the language name; cell metadata, outputs and execution counts are empty.

| Notebook | Cell | Change |
|---|---|---|
| C10H6 | 0 | title: environment name replaced |
| C10H6 | 0 | setup text: GPU and secret names |
| C10H6 | 2 | install comment |
| C10H6 | 3 | title wording |
| C10H6 | 3 | comment |
| C10H6 | 3 | secret names replaced by environment variable names |
| C10H6 | 3 | storage section header |
| C10H6 | 3 | storage setting replaced by a local results folder |
| C10H6 | 3 | storage sub-folder setting (1 line removed) |
| C10H6 | 4 | title |
| C10H6 | 4 | storage-mount block replaced by one local-path line (9 lines) |
| C10H6 | 4 | message |
| C10H6 | 12 | docstring |
| C10H6 | 13 | docstring |
| C10H6 | 13 | secret lookup replaced by environment lookup |
| C10H6 | 13 | message |
| C10H6 | 23 | download setting (the helper it controlled was removed) (1 line removed) |
| C10H6 | 29 | title |
| C10H6 | 29 | path under the results folder |
| C10H6 | 29 | download helper block removed |
| C10H6 | 32 | title |
| C10H6 | 33 | title |
| C10H6 | 33 | path under the results folder |
| C10H6 | 33 | download helper removed |
| C10H6 | 34 | path under the results folder |
| C10H6 | 34 | download helper (1 line removed) |
| C10H6 | 37 | title |
| C10H6 | 37 | path under the results folder |
| C10H6 | 37 | download helper removed |
| C11H8 | 0 | title: environment name replaced |
| C11H8 | 0 | setup text: GPU and secret names |
| C11H8 | 2 | install comment |
| C11H8 | 3 | title wording |
| C11H8 | 3 | comment |
| C11H8 | 3 | secret names replaced by environment variable names |
| C11H8 | 3 | storage section header |
| C11H8 | 3 | storage setting replaced by a local results folder |
| C11H8 | 3 | storage sub-folder setting (1 line removed) |
| C11H8 | 4 | title |
| C11H8 | 4 | storage-mount block replaced by one local-path line (9 lines) |
| C11H8 | 4 | message |
| C11H8 | 12 | docstring |
| C11H8 | 13 | docstring |
| C11H8 | 13 | secret lookup replaced by environment lookup |
| C11H8 | 13 | message |
| C11H8 | 23 | download setting (the helper it controlled was removed) (1 line removed) |
| C11H8 | 29 | title |
| C11H8 | 29 | path under the results folder |
| C11H8 | 29 | download helper block removed |
| C11H8 | 32 | title |
| C11H8 | 33 | title |
| C11H8 | 33 | path under the results folder |
| C11H8 | 33 | download helper removed |
| C11H8 | 34 | path under the results folder |
| C11H8 | 34 | download helper (1 line removed) |
| C11H8 | 37 | title |
| C11H8 | 37 | path under the results folder |
| C11H8 | 37 | download helper removed |

The two notebooks differ in the molecule setting, two default values and the Part B title; see `cells/C11H8_differences.diff`.
