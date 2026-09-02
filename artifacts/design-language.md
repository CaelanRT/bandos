# bandOS Design Language v0.2

### Contemporary musician's stationery

**Visual methodology:** Software composed like printed matter.  
**UX constraint:** Conventional interaction, unconventional composition.

---

# 1. Product character

bandOS is a professional workspace built for musicians and bands.

It should feel like a **well-made working object**, not a piece of enterprise software and not an AI product.

The central metaphor remains:

> **A great notebook, a great pen, and a very organized bandleader.**

The visual methodology adds another idea:

> **The software is composed like printed matter.**

The interface combines:

- the warmth and tactility of stationery
- the information density of a musician's working notebook
- the typographic confidence of concert programs, record design, architecture-school graphics and institutional print
- the compositional freedom of modernist and post-modernist editorial design
- the speed, predictability and accessibility of excellent modern productivity software

### Personality

**Warm, not cute.**  
**Elegant, not luxurious.**  
**Efficient, not clinical.**  
**Playful, not whimsical.**  
**Tactile, not skeuomorphic.**  
**Modern, not futuristic.**  
**Minimal, but not sterile.**  
**Graphic, but not decorative.**  
**Musical, but not music-themed.**

---

# 2. Design principles

## I. The workspace is the interface

Content should dominate.

Avoid excessive containers, dashboards and floating cards. Prefer pages, rows, sections, margins, typography, rules and compositional blocks.

The user should feel like they are working *on their band's material*, rather than operating software.

---

## II. Quiet in operation, confident in composition

The interface should visually recede when sustained concentration matters.

Graphic expression does not need to disappear.

Large fields of colour, dramatic typography, unusual scale and strong composition may establish identity, hierarchy or rhythm without implying urgency or interactivity.

Motion and elevated surfaces remain restrained. Working surfaces should remain comfortable enough to leave open for hours.

**Quiet does not mean visually timid.**

---

## III. Dense information can still breathe

Do not confuse spaciousness with enormous padding.

Musicians may eventually manage:

- rehearsals
- gigs
- setlists
- songs
- charts
- personnel
- availability
- contacts
- payments
- files
- notes
- equipment
- tasks

bandOS should handle substantial information density gracefully.

Whitespace should separate *ideas*, not every individual element.

Density should follow the nature of the material. A repertoire index can be dense. A show page can breathe. An onboarding screen can be almost empty.

---

## IV. Typography creates hierarchy before containers do

Before adding a box around something, attempt to establish hierarchy using:

1. position
2. spacing
3. typography
4. scale
5. a rule or divider
6. subtle background or colour-field variation

Only then introduce a container.

Type is not merely content placed into a layout. It is one of the materials from which the layout is built.

---

## V. Music influences structure, not decoration

Avoid generic musical decoration.

No floating music notes.  
No treble-clef wallpaper.  
No waveform backgrounds.  
No guitar silhouettes.

Instead, borrow from how musicians already organize information:

- measures
- set lists
- rehearsal markings
- programs
- scores
- track listings
- session sheets
- liner notes
- catalogue numbers
- handwritten annotations

The product should feel musical because of how information behaves.

---

## VI. Conventional interaction, unconventional composition

Interaction grammar should remain familiar.

Buttons should behave like buttons. Inputs should look editable. Navigation should remain predictable. Focus states should be obvious. Destructive actions should be clear.

Graphic composition may be much more expressive.

**Break the visual grid, never the interaction model.**

---

# 3. Compositional grammar

bandOS uses a disciplined grid, but the grid is a foundation rather than a cage.

Most information should align predictably. Selected elements may intentionally interrupt the grid to establish hierarchy, rhythm or identity.

Permitted techniques include:

- asymmetric columns
- dramatically unequal column widths
- oversized typography spanning columns
- diagonal rules
- diagonal image crops
- offset blocks
- interrupted rules
- narrow metadata columns
- vertical labels
- edge-aligned typography
- intentional cropping
- large fields of uninterrupted colour
- unexpected whitespace
- occasional overlap where legibility remains intact

The underlying layout should remain rational even when the composition looks unusual.

Experimental composition should be concentrated in meaningful places: page headers, event summaries, setlists, repertoire indexes, onboarding, empty states, band identity moments and editorial views.

Routine form completion and high-frequency controls should remain visually straightforward.

---

# 4. Colour

## Foundation

The default interface should be warm rather than digitally white.

### Paper

`#F7F5F0`

Primary workspace background.

### Surface

`#FCFBF8`

Inputs, menus, raised working surfaces and occasional panels.

### Ink

`#25231F`

Primary text.

Avoid pure black for the default light interface.

### Graphite

`#68645D`

Secondary text.

### Pencil

`#969087`

Tertiary information, timestamps and annotations.

### Rule

`#DDD9D1`

Dividers and borders.

### Faint Rule

`#EAE7E0`

Extremely subtle structure.

---

## Graphic inks

bandOS should use colour more like **print ink** than a conventional SaaS accent system.

Initial families worth testing:

### Oxblood

`#8B3D35`

### Burnt Orange

`#C95F32`

### Ochre

`#C99A35`

### Cobalt

`#3358A3`

### Deep Forest

`#405A48`

These values are starting points, not a locked production palette.

### Composition rule

Most compositions should use:

**Paper + Ink + one graphic ink**

Occasionally use two graphic inks. Rarely use more.

Colour may occupy a large part of a page while remaining semantically neutral.

A large orange field does not automatically mean warning. A cobalt block does not automatically mean clickable. Graphic colour may exist simply to create hierarchy, rhythm and identity.

---

## Semantic colour

Semantic colours should remain distinct from graphic inks and should be muted enough to live comfortably inside the system.

Success should resemble moss rather than neon green.

Warnings should resemble ochre rather than bright yellow.

Errors should resemble brick rather than saturated red.

Information should generally use graphite or a restrained blue-grey.

Never rely on colour alone to communicate status.

---

# 5. Typography

Typography is one of the primary identity systems of bandOS.

The system should not depend on a serif/sans contrast to feel editorial.

Use up to three typographic voices.

## Primary grotesk

The workhorse.

Used for:

- navigation
- controls
- forms
- tables
- metadata
- schedules
- buttons
- timestamps
- dense information
- many page titles
- oversized graphic type

Characteristics:

- humanist, neo-grotesque or modern grotesk
- highly legible at small sizes
- broad family with useful weights
- ideally useful condensed or alternate widths
- restrained personality
- strong numerals

Candidates to test:

- FF Unit / Unit-style families
- IBM Plex Sans
- Instrument Sans
- Neue Haas / Helvetica-adjacent grotesks
- Univers-style families
- Akzidenz-Grotesk-style families
- Suisse-style grotesks

Inter and Geist remain acceptable implementation fallbacks, but should not automatically become the visual answer simply because they are familiar.

---

## Display voice

The display voice may be:

- the primary grotesk at an extreme size or weight
- a condensed or extended companion
- a second compatible sans with stronger graphic personality

Use it for:

- major dates
- event names
- band names
- setlist titles
- repertoire section markers
- graphic onboarding moments
- occasional navigation landmarks

Display type may be tightly packed, cropped, oversized or allowed to cross normal column boundaries when readability remains intact.

---

## Editorial serif

A serif is optional, not mandatory.

Use selectively when it adds warmth, authorship or literary character:

- long-form notes
- selected band names
- editorial introductions
- occasional repertoire or program moments
- text intended to resemble liner notes or printed matter

Candidates to explore:

- Source Serif 4
- Newsreader
- Instrument Serif
- Literata

The serif should never make the application resemble a newspaper or luxury fashion website.

It is a third voice, not the default definition of sophistication.

---

# 6. Type hierarchy and scale

Working typography should remain compact and highly legible.

Suggested normal ranges:

**Section heading**  
16–18px

**Body**  
14–16px

**Working UI**  
13–14px

**Metadata**  
11–12px

Small typography is encouraged where appropriate.

Metadata can use slight letter spacing and uppercase sparingly:

`FRI 28 AUG · 8:30 PM`

For compositional moments, do not enforce a conventional app-scale ceiling.

Display type may reach:

`40 / 56 / 72 / 96 / 120px`

or larger when the viewport and information justify it.

Large typography must carry information or identity.

A giant date can be useful. A giant generic greeting usually is not.

Extreme scale contrast is encouraged:

**very large primary information + very small precise metadata**

This should become one of bandOS's recognizable visual behaviours.

---

# 7. Spacing

Use a **4px base unit**.

Primary increments:

`4 / 8 / 12 / 16 / 24 / 32 / 48 / 64`

Most working interfaces should live around 8–24px.

Avoid the contemporary tendency to put 32px of padding inside every component.

Large whitespace belongs between conceptual sections and may itself become a compositional element.

Whitespace can be deliberately asymmetric. It does not need to be evenly distributed simply because the layout is digital.

---

# 8. Shape

Rounded corners should exist, but remain restrained.

Suggested system:

- small controls: 5–6px
- inputs: 6–8px
- menus/popovers: 8–10px
- major surfaces: 10–12px

Avoid ubiquitous 16–24px "AI card" rounding.

Pills should primarily communicate things that conceptually deserve to be pills:

- status
- tags
- filters

Buttons do not automatically need to be capsules.

Rectangles and hard-edged colour fields are valid graphic tools and do not need to become rounded cards.

---

# 9. Borders and elevation

Prefer **rules to shadows**.

Primary border:

`1px solid #DDD9D1`

Use shadows primarily for objects genuinely positioned above the workspace:

- command palette
- dropdown
- modal
- floating menu
- dragged object

Permanent content should rarely float.

Rules may be used compositionally, not merely as separators. They can extend beyond content, stop unexpectedly, create columns or become part of a page's visual rhythm.

Diagonal rules are allowed in expressive contexts, provided they do not obscure controls or reading order.

---

# 10. Layout

Desktop may use three conceptual regions when necessary:

**Navigation / Workspace / Context**

Navigation remains narrow.

The workspace receives the overwhelming majority of visual attention.

Contextual information can appear in a right inspector rather than forcing navigation to separate pages.

This allows workflows such as:

`Setlist → select song → song details appear`

without losing context.

Not every page requires all three regions.

Within the workspace, use a strong underlying column grid. Different pages may compose against that grid differently rather than sharing one universal dashboard template.

---

# 11. Navigation

Navigation should feel closer to a notebook index or program contents page than an enterprise admin sidebar.

Possible structure:

BAND NAME

Today

CALENDAR  
Rehearsals  
Shows

MUSIC  
Repertoire  
Setlists  
Files

BAND  
Members  
Tasks

––––––––

Settings

Use icons sparingly.

Text should remain sufficient for most navigation.

Active state can use a graphic ink as a small mark, rule, typographic change or edge treatment rather than a giant coloured rectangle.

Navigation is not the place for compositional experimentation that harms wayfinding.

---

# 12. Rows over cards

The **row** should become one of bandOS's signature components.

A gig might appear as:

`28 FRI   The Rainbow Bistro                    8:30 PM`  
`         Ottawa · Load-in 6:30`

A song:

`04       Moanin'                 F minor       5:42`  
`         Bobby Timmons           Hard Bop`

A member:

`AR       Andrew Roberge-Toll     Tenor Sax`  
`         Available · Thursday rehearsal`

These should feel closer to beautifully typeset indexes, track listings and catalogue pages than database records.

Rows can vary in scale and density depending on context. They do not all need identical heights if hierarchy benefits from variation.

---

# 13. Cards

Cards are allowed.

They simply need to earn their existence.

Appropriate:

- an upcoming-show summary
- an onboarding prompt
- a preview
- a temporary contextual object
- a piece of content that conceptually behaves as one object

Inappropriate:

Wrapping every dashboard statistic, every section and every list item in independent rounded rectangles.

A card is an object.

A rectangle is only a shape.

Do not confuse the two.

---

# 14. Blocks and fields

A **block** is a compositional region of colour, type, image or negative space.

It may define hierarchy without behaving like a card.

Blocks may:

- touch page edges
- interrupt columns
- contain oversized type
- crop imagery
- create strong horizontal or vertical bands
- sit behind non-interactive text
- divide a page without a border

A block is not automatically clickable, elevated or rounded.

Use blocks to give screens graphic structure without importing the visual language of dashboard cards.

---

# 15. Inputs

Inputs should feel like places to write.

Prefer:

- warm surface
- fine underline or border
- clear typography
- generous horizontal space
- restrained but obvious focus state

Long-form notes should particularly resemble writing onto a page rather than typing into a web form.

Experimental composition should never make it unclear where typing begins, what is editable or what value belongs to which label.

---

# 16. Icons

Icons should be:

- fine
- geometric
- slightly human
- consistent
- mostly outline based

Lucide is an excellent practical starting point.

Do not invent custom music icons unless necessary.

Icon + text is preferable to unexplained icon-only controls for important actions.

Icons should support the system rather than become its personality. Typography and composition carry more identity.

---

# 17. Motion

Motion communicates physical relationship.

Objects:

- slide
- unfold
- reveal
- tuck away
- move
- settle

They do not:

- bounce
- glow
- sparkle
- dramatically morph

Typical duration:

`150–250ms`

Most actions should feel almost instantaneous.

Motion should help the user understand **where something went**.

For expressive screens, typography or blocks may reveal sequentially, but motion should feel closer to paced editorial presentation than advertising animation.

---

# 18. Interaction personality

Interactions should occasionally provide tiny tactile pleasures.

Examples:

- dragging songs to reorder a set
- a subtle insertion line appearing between tracks
- completed tasks fading and striking through
- an inspector sliding out from the page edge
- sections gently expanding in place
- a set's total runtime updating immediately while songs move

Delight should come from **craft**, not spectacle.

The expressive visual layer should never reduce perceived responsiveness.

---

# 19. Photography and artwork

When artist photography or album artwork appears, let it provide colour and texture.

The application itself does not need to compete.

Photography can become one of the major sources of visual variation within the otherwise restrained system.

Images may be:

- full-bleed
- tightly cropped
- placed in narrow vertical fields
- intersected by type or rules where legibility permits
- treated as compositional material rather than generic thumbnails

This allows each band's workspace to feel subtly like *their band* without requiring extensive theming.

---

# 20. Density modes

bandOS should not enforce one universal density.

Use at least three conceptual modes.

## Quiet

For:

- onboarding
- empty states
- major event summaries
- identity moments

Characteristics:

- large whitespace
- few elements
- dramatic scale
- strong composition

## Working

For:

- event editing
- rehearsal planning
- member management
- notes

Characteristics:

- moderate density
- predictable controls
- restrained hierarchy
- comfortable sustained use

## Index

For:

- repertoire
- files
- setlists
- schedules
- personnel directories

Characteristics:

- small type
- tight rows
- narrow metadata columns
- rules and alignment
- high information density

Changing density should feel intentional, like moving between a poster, a working page and a catalogue.

---

# 21. Empty states

Avoid:

"✨ Let's make some magic!"

Prefer straightforward human language.

**No upcoming shows**

Your calendar is clear after August 28.

`Add a show`

Empty states are one of the safest places for more expressive composition because little functional information is competing for attention.

They may use oversized type, a strong colour field, unusual whitespace or carefully paced motion while remaining direct.

---

# 22. Voice

Language should resemble a competent bandmate.

Short.  
Specific.  
Relaxed.  
Never corporate.

Prefer:

**Add song**

over:

**Create new repertoire item**

Prefer:

**Who's available?**

over:

**Member availability management**

Prefer:

**Show details**

over:

**Event information overview**

The graphic design may be sophisticated. The language should not become precious.

---

# 23. Anti-patterns

bandOS should actively avoid:

- purple/blue AI gradients
- glowing controls
- excessive glassmorphism
- excessive cards
- excessive pills
- huge border radii
- gratuitous dashboards
- unnecessary charts
- giant typography without informational purpose
- excessive iconography
- emoji as interface decoration
- fake handwritten fonts
- literal musical decoration
- gradients used simply to make things "interesting"
- everything being centre-aligned
- excessive animation
- chatbot-first UX
- AI features visually dominating normal workflows
- arbitrary visual chaos disguised as experimentation
- breaking reading order for novelty
- making conventional controls mysterious
- reproducing vintage graphic design literally instead of translating its principles

AI, when present, is a **capability of bandOS**, not its visual identity.

The goal is not to make software look old.

The goal is to recover useful graphic-design techniques that contemporary software often ignores.

---

# 24. Signature visual motifs

A few recurring ideas can make the system recognizable.

### The rule

Fine lines organize information like a notebook, score, program or architecture poster.

Rules can also establish rhythm and occasionally interrupt the grid.

### The index

Numbers, dates and compact metadata sit in dedicated narrow columns.

### The mark

A small application of a graphic ink identifies active or significant information.

### The page

Large uninterrupted surfaces create the feeling of working on paper.

### The annotation

Small secondary typography communicates context without interrupting the primary content.

### The photograph

Artist imagery provides moments of richness against the restrained interface.

### The block

A field of colour, type, image or negative space defines a compositional region without automatically becoming a UI container.

### The interruption

A diagonal, crop, oversized word, displaced label, broken rule or unexpected alignment occasionally interrupts an otherwise rational composition.

Interruptions create rhythm and identity.

They should remain rare enough to feel intentional.

---

# 25. Responsive translation

Do not attempt to preserve a desktop composition literally on every viewport.

Preserve:

- hierarchy
- reading order
- semantic grouping
- interaction predictability
- the relationship between major and minor information

Translate:

- column count
- crop
- scale
- orientation
- whitespace
- diagonal or overlapping elements

A desktop page may be highly asymmetric while mobile becomes a strong vertical sequence.

The composition may change. The information model should not.

---

# 26. Accessibility and legibility guardrails

Graphic experimentation is subordinate to usability.

Maintain:

- sufficient text contrast
- clear focus states
- usable target sizes
- semantic HTML and reading order
- predictable keyboard navigation
- visible labels for important controls
- colour-independent status communication
- reduced-motion support
- legibility at zoom and narrow widths

Decorative diagonals, crops and overlaps should not alter semantic reading order.

Accessibility is not a separate aesthetic. It is part of the discipline underneath the composition.

---

# 27. Design test

Before adding an element, ask:

**Does it help the musician work?**

**Could typography, scale or spacing solve this before another container does?**

**Is this rectangle actually a card, or merely a compositional block?**

**Would this still look good after staring at it for four hours?**

**Does this feel intentionally designed, or like a component-library default?**

**Is the interaction conventional even if the composition is unusual?**

**Does the grid break for a reason?**

**Could this have been printed beautifully?**

**Does this feel musical because of structure rather than decoration?**

If not, reconsider it.

---

# 28. North star

bandOS should eventually feel difficult to categorize.

Not quite Notion.

Not quite Linear.

Not quite a calendar.

Not quite a band-management SaaS.

Its three guiding ideas are:

> **Contemporary musician's stationery.**

> **Software composed like printed matter.**

> **Conventional interaction, unconventional composition.**

It should feel like someone took the physical working materials surrounding a serious musician, understood why they work, absorbed the graphic intelligence of great programs, records, catalogues and institutional print, and quietly gave those materials the capabilities of modern software.

The result should feel contemporary rather than nostalgic.

**The computer disappears. The work remains.**

