# Onsite-Notes

A simple note-taking application combined with project and tag tracking, meant for (local) LLM integration.

## Features

- Simple text-based, timestamped logs, with minimal formatting
- Easy hotkeys for inserting timestamps to begin new entries and starting new days
- Project and task tracking, with automatic summation/analysis for billable and non-billable time-tracking
- User mention tracking
- Autocomplete for existing tags, mentions and projects
- TODO management associated with tasks
- File-backed storage with complentary database indexing of tags and mentions
- Easy integration with AI through local LLM support and document scanning
- Retreival-augmented generation (RAG) search and summarization

## Data Model

Log entries come in several varieties:
1. Active, Billable topics (i.e. something to explicitly include on an invoice)
2. Active, but not directly Billable topics (i.e. an employee is working, just not on anything directly attributable to a client invoice)
3. Inactive (i.e. taking a break or lunch)

Log entries will have:
1. **Timestamp** -- when the entry began, both time (hour/minute) and date
2. **Duration** -- implied by the starting timestamp of a following entry
3. **ID** -- a unique, continugous, non-whitespace phrase preceded by a particular symbol, identifying a specific task or topic; in two flavors:
	a. **Tag** -- referring to an actively-billable topic, preceeded by `#`
	b. **Mention** -- referring to an inactive entry, preceeded by `@`
4. **Project** -- an organizational group of one or more associated Tags; generally a human-readable name for the ID
5. **Details** -- optional description of the entry, which may contain **Links** to other Tags or Mentions

Entries should be indexed by ID, so that each ID keeps track of all entries for it, as well as any Link referring to that Tag or Mention.  This is not only to allow for time-tracking by topic, but auto-complete when a user begins typing a Link.

Entries without an ID will not be indexed, but will still show up when they contain any Links.

IDs should be saved with their type (Tag, Mention) as well as earliest and latest timestamps (date) that they appear, to make autocomplete easier.

Any TODOs within an entry should be associated with its ID in a separate list, with state (LATER, DOING, NOW, DONE, CANCELED) and position.

### Data Persistence

Entries themselves won't be stored in a database, rather instead within date-based plain-text files (for easier portability and LLM access), but the IDs and Projects will be saved in a durable data store for easy analysis.  Links can then be stored as a table joining the ID to each date-file and position within the date-file.  Upon editing the record(s) of a day, Link positions should be automatically recalculated.

Altogether, both files and database should be tied together as a "notebook", which is just represented by a separate subfolder containing them.  This will allow a user to switch between notebooks.

### Data Analysis

Generally, at the end of the day a user will want to know what they worked on and how long it took, e.g. so they can clock in and out appropriately.  Additionally, over time they will want to be able to accurately bill clients for the actual tasks performed, e.g. generate an invoice for a specific time period.

To support these activities, upon the close of a day (either via beginning an entry with 'done' or manually separating the day) the application should automatically return a daily summary of each variety of entry, as well as a per-ID breakdown for that day.

## Log Format

Log entries are comprised of simple, tab-separated lines beginning with a timestamp:

	TIMESTAMP	#TAG	PROJECT	optional, additional Details or summary

Within a log entry, immediately following the _Timestamp_ is a `#` symbol preceding the _Tag_.  The Tag should be followed by its associated _Project_.

Following the Project, either on the same line or in following lines, are optional _Details_ describing the Tag such as work completed or actions taken.  These details should be available to search and summarization.

Any following lines that have been indented with at least one tab are treated as further Details in the log entry.  Those indented lines may themselves start with a tab-separated timestamp, but aren't treated as separate or sub-entries, and is mostly cosmetic.

Within the Details, any referenced Tag (a contiguous non-whitespace phrase preceeded by the `#` symbol) or _Mention_ (a contiguous non-whitespace phrase preceeded by the `@` symbol) will stand out from regular text and be treated as a _Link_.

Any log entries beginning with just a timestamp but not followed by a Tag won't be automatically associated with a topic, generally serving to end the time-tracking of a preceding entry.  However, their details may still contain Links, and they will be counted as active but not billable time for the purposes of daily analysis.  If they start with a Mention instead of a Tag they will be tracked similar to a Tag, but not counted as active or billable for the sake of analysis, and will not be associated as a Link.

Log entries should be organized into daily sections, with each new day visually separated from the previous.  In its original single-file design, entering a simple multi-line delimiter within the application would break the actual data into separate days, but as they're actually stored in separate files, using a hotkey to end the day will provide a visual-only indicator of the separation.

### Examples

**Single-line projects**

	09:00 2026-02-18	in, remote
		...
	15:04 2026-02-18	#documentation-readme	Onsite-Notes App	started work on the app readme
	15:09 2026-02-18	#documentation-example	Onsite-Notes App	working on examples
	16:09 2026-02-18	#JIRA-12345	Support	random support task
	15:28 2026-02-18	done (6.47h)

**Multi-line projects**

	09:00 2026-02-18	begin
		...
	12:30 2026-02-18	@lunch
	13:05 2026-02-18	back to work...
	15:12 2026-02-18	#COBRA-283762	Project Cobra	implementing feature A
		15:45 2026-02-18	writing unit tests
		15:55 2026-02-18	more unit tests, particularly tricky scenario
	16:05 2026-02-18	#support	Support	general support tasks
	16:32 2026-02-18	#COBRA-283762	Project Cobra	back to feature A
	17:00 2026-02-18	done (7.42h)

**Daily Delimiter**

	...
	16:22 2026-02-17	done early, carpool
	---------------------


	=====================
	09:15 2026-02-18	#it-kickoff	IT	meeting to discuss new IT iniatives
	...

## User Interaction

Application will present a simple textbox for data entry, with buttons/hotkeys for actions like entering a timestamp (<kbd>F9</kbd>), ending the day (<kbd>CTRL+F9</kbd>), marking TODOs complete/rejected/in-progress (cycle with <kbd>F5</kbd>), and requesting a time analysis (<kbd>F1</kbd>).  The log entries themselves should apply simple syntax/formatting to highlight Tags, Mentions, as well as basic Markdown-style formatting like bullet points, bold/italic/strikethrough/code, and todo checkboxes (similar to Logseq).

Entering and editing the entries within a day should behave just like editing a block of text (with support for the <kbd>TAB</kbd> key/character), but automatically (in the background, debounced) parse the entry itself for changes, saving to a file and extracting relevant information (ID, Link position, etc) to save to the database.  Scrolling upwards to prior days should autoload previous entries in separate adjacent textboxes, with a configurable number of prior days preloaded on application start.  Navigating via keyboard (up/down/left/right) should seamlessly wrap between textboxes at the beginning or end.

Beginning a Tag or Mention, either as the start of an entry or Linking within Details, should provide an inline autocomplete box suggesting the top 10 (configurable) most recently used, narrowing down IDs as user continues typing.

Typing a TODO within an entry (either by typing the status in all-caps, or with text-based checkboxes like `[ ]`) should associate it with the Tag, so that they can be aggregated (an Linked) from a Tag overview.

Control-clicking a Tag or Mention should pop up an overview sidebar of all Links referring to the ID (with a clickable navigation showing surrounding text, length configurable), and in the case of Tags the calculated sum of all entry times associated with that Tag.  Clicking a link should jump straight to the relevant entry, loading it appropriately if it's not already loaded.  If there days between loaded entries, insert a "Load More" placeholder that when clicked will insert a configurable number of days as adjacent textboxes.

Requesting a time analysis will pop up several options:
* current day
* last 7 days
* selected text/entries
* custom time period (specify start date + end date)

Selecting an option will retrieve the text from that time period (or selection), parse them for entries, and create a summary of Tags, Projects, and active/total time like the following, with calculated values indicated between angled brackets `<EXPLANATION OF PLACEHOLDER>`:

	=== SUMMARY ===
	<TOTAL ENTRY COUNT> entries, <UNIQUE PROJECT COUNT> projects
	<NUMBER OF DAYS WITH ENTRIES> days spanning <NUMBER OF CALENDAR DAYS B/W START AND END>
	<AVERAGE DAILY TIME, decimal format>h/day --> <AVERAGE ACTIVE DAILY TIME, decimal format>h/day on
	<TOTAL HOURS, time format>	|	<ACTIVE HOURS, time format> (<ACTIVE HOURS, decimal format>) = <PERCENTAGE ACTIVE / TOTAL HOURS>% on	<INACTIVE HOURS, time format> (<INACTIVE HOURS, decimal format>) = <PERCENTAGE INACTIVE / TOTAL HOURS>% off

	=== DAILY (<TOTAL DAY COUNT> days, <TOTAL ENTRY COUNT> entries) ===
	<DAY 1 HOURS, time format>	|	<DAY 1 ACTIVE HOURS, time format> (<DAY 1 ACTIVE HOURS, decimal format>) = <PERCENTAGE ACTIVE / TOTAL HOURS for DAY 1>% on	<DAY 1 INACTIVE HOURS, time format> (<DAY 1 INACTIVE HOURS, decimal format>) = <PERCENTAGE INACTIVE / TOTAL HOURS for DAY 1>% off
	<...repeat for each subsequent day...>

	=== PROJECTS (<UNIQUE PROJECT COUNT>) ===
	<SUM HOURS FOR ID1, time format>	<SUM HOURS FOR ID1, decimal format>	<ID1 as Tag or Mention>	<PROJECT1>	(<PERCENT OF HOURS for ID1 / TOTAL HOURS>%)
	<SUM HOURS FOR ID2, time format>	<SUM HOURS FOR ID2, decimal format>	<ID2>	<PROJECT2>	(<PERCENT OF HOURS for ID2 / TOTAL HOURS>%)
	<...repeat for each subsequent Tag or Mention...>

Performing a search should have two modes: simple (regular text) and deep (leveraging local LLM/AI).  Simple text search should just scan through all entries (forward using <kbd>F3</kbd> or back with <kbd>SHIFT+F3</kbd>) for the exact text match, jumping to each result.  Deep search should open a chat popup to query an AI model for more complex questions and analysis such as:
* "when did I work with @person1 on #projectA?"
* "what did @person2 say about database design for #projectB?"

### Visual Styling

The following should have user-configurable formatting:

- Monospaced font (preferrably 'Deja Vue Mono')
- **Tags, Mentions** -- bold and orange, hex #ff8040
- URLs -- dark blue, hex #0080c0
- Bullets -- single dash `-` and asterisks `*` and tilde `~` and therefore `.:` should be turquoise, hex #00ffff
- Code -- text between backticks ``foo`` should be light purple, hex #a851ff
- Code Block -- text between curly-braces `{` and `}` should be turquoise, hex #00ffff
- Source Control comment -- any prefix starting with (configurable) `GIT:` or `SVN:` or `AWS:` should be dark yellow, hex #808040
- TODO
	- completed TODO -- green `[✔]` or other unicode character, hex #00a000
	- canceled TODO -- red `[x]` or equivalent unicode character, hex #840000
	- pending TODO -- yellow `[ ]` empty box or equivalent unicode character, hex #c3c12b
	- in-progress TODO -- yellow `[~]` or equivalent dotted-box unicode character
	
### Example Analysis

The following is an arbitrary example of what a generated analysis could look like for a contiguous 3 day period:

	=== SUMMARY ===
	26 entries, 12 projects
	3 days spanning 3
	4.33h/day --> 4.19h/day on
	12:59	|	12:34 (12.57) = 96.8% on	2:25 (2.42) = 18.6% off

	=== DAILY (3 days, 26 entries) ===
	4:00	|	3:35 (3.58) = 89.6% on	0:00 (0.00) = 0.0% off
	1:39	|	1:39 (1.65) = 100.0% on	0:00 (0.00) = 0.0% off
	7:20	|	7:20 (7.33) = 100.0% on	2:25 (2.42) = 33.0% off

	=== PROJECTS (12) ===
	6:08	6.13	#jobsearch	Jobs	(48.8%)
	0:13	0.22	#linkedinlearning	LinkedIn Learning	(1.7%)
	1:14	1.23	#talking-points	Jobs	(9.8%)
	0:30	0.50	#connect-role1	Prep	(4.0%)
	2:23	2.38	#onsite-notes	Onsite Notes	(19.0%)
	0:47	0.78	#role2-1stcall-prep	Jobs	(6.2%)
	0:10	0.17	#role2-1stcall	Jobs	(1.3%)
	1:06	1.10	@laundry		(8.8%)
	0:58	0.97	#random-webinar	School Alumni	(7.7%)
	0:11	0.18	#copilot-customization	Dev	(1.5%)
	0:08	0.13	@snack		(1.1%)
	1:11	1.18	@walk		(9.4%)

### Deep Search

To be determined, but likely based on the following articles:
* https://www.alibaba.com/product-insights/how-to-run-a-lightweight-local-llm-on-your-laptop-for-note-taking-without-internet-or-subscription-fees.html
* https://www.freecodecamp.org/news/run-an-llm-locally-to-interact-with-your-documents/

The intent is to have the LLM/agent be able to scan local daily files to provide a chat-based experience answering questions about the contents.