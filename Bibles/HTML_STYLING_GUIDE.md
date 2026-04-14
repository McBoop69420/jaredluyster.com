# HTML Styling Guide

This document describes how the Wizard Battle website is styled today and which HTML/CSS patterns define its look.

## Style System Overview

The site uses a dark fantasy game UI with:

- layered radial and linear gradients for the page background
- warm parchment text on a deep violet-black base
- gold as the main accent
- translucent glass-like cards and panels
- rounded corners with soft glow and shadow treatment
- condensed sans-serif body text with serif display headings

The main shared stylesheet is [style.css](/Users/jaredl/Documents/Wizard%20Battle/style.css). Two supporting content pages, [keywords.html](/Users/jaredl/Documents/Wizard%20Battle/keywords.html) and [type-chart.html](/Users/jaredl/Documents/Wizard%20Battle/type-chart.html), currently ship with inline styles that reuse the same visual language.

## Core Design Tokens

The root custom properties in [style.css](/Users/jaredl/Documents/Wizard%20Battle/style.css) establish the palette and shared effects:

- `--bg`, `--bg-deep`: base dark surfaces
- `--ink`: primary text color
- `--muted`: secondary text color
- `--line`, `--line-strong`: borders and separators
- `--gold`, `--ember`, `--sky`, `--moss`, `--plum`: accent colors
- `--card`, `--card-strong`: translucent panel backgrounds
- `--shadow`, `--shadow-soft`: elevation
- `--hp-fill`, `--hp-bg`: health bar colors
- `--fire`, `--water`, `--earth`, `--arc`, `--ice`, `--shadow-type`, `--light`: elemental type colors

Safe-area variables are also defined so mobile/fullscreen layouts respect device insets:

- `--safe-top`
- `--safe-right`
- `--safe-bottom`
- `--safe-left`

## Global HTML Styling

The global reset and page shell do the following:

- apply `box-sizing: border-box` to all elements
- remove default margin and padding
- disable text selection globally for the game UI
- set `scroll-behavior: smooth` on `html`
- use a full-screen gradient background on both `html` and `body`
- add a faint grid overlay using `body::before`
- hide page overflow on the main game screen

Typography:

- body font: `"Avenir Next Condensed", "Gill Sans", "Trebuchet MS", sans-serif`
- display headings: `Georgia, "Times New Roman", serif`
- headings use tight line-height and larger scale for a dramatic title treatment
- utility labels use uppercase with wide letter spacing

## Layout Structure

The main app HTML in [index.html](/Users/jaredl/Documents/Wizard%20Battle/index.html) is organized as a full-screen screen stack:

- `#game`: fixed viewport container
- `.screen`: hidden-by-default app screens
- `.screen.active`: visible screen
- `.screen-scroll`: scrollable interior area with safe-area padding
- `.shell`: centered content wrapper with max width

This gives the game an app-like layout instead of a normal scrolling document.

## Shared Reusable Styling Patterns

Several HTML blocks share one common panel treatment:

- `.hero-copy`
- `.hero-card`
- `.combatant-panel`
- `#battle-log`
- `#battle-bottom`
- `.map-panel`
- `.modal-box`
- `#deck-view-box`
- `#how-to-play-box`
- `#card-preview-box`
- `.wizard-card`
- `.spell-card`
- `.reward-card`
- `.action-btn`
- `.shop-item`

These elements generally use:

- `border: 1px solid var(--line)`
- `background: var(--card)` or a stronger layered variant
- large rounded corners
- strong drop shadows
- subtle decorative pseudo-elements with radial glow

This is the primary card/panel language for the site.

## Header And Brand Styling

The top navigation/header uses:

- `.topbar`: blurred translucent strip with bottom border
- `.topbar-inner`: flex container for alignment and spacing
- `.brand`: uppercase brand lockup
- `.brand-mark`: icon tile with gradient background and rounded square frame
- `.brand-copy strong` and `.brand-copy span`: title/subtitle text stack

In the main game this header appears on title, map, and battle screens. The standalone reference pages reuse the same structure with a nav row.

## Buttons And Interactive States

Buttons share a pill-shaped treatment through `.button`:

- inline-flex centering
- minimum height of `48px`
- uppercase label styling
- rounded `999px` radius
- hover lift via `transform: translateY(-2px)`

Variants:

- `.button-primary`: gold-to-orange gradient, dark text
- `.button-secondary`: translucent neutral button with border

Disabled buttons reduce opacity and remove hover movement.

Cards and action tiles use similar hover motion:

- `.wizard-card`
- `.spell-card`
- `.reward-card`
- `.shop-item`
- `.action-btn`

The standard interaction pattern is a slight upward lift and stronger shadow/border.

## Content Components

### Eyebrow Labels

`.eyebrow` is the standard small section label:

- inline pill
- uppercase
- gold text
- translucent background

It is used heavily for section intros, modal labels, and battle headers.

### Wizard Selection Cards

`#wizard-grid` renders a four-column grid on desktop. Each `.wizard-card` includes:

- icon block
- card name
- type label
- HP line
- description

Selected cards get a gold border and highlight ring.

### HUD And Bars

The map and battle top bars use:

- `.hud-bar`, `.hud-group`
- `.bar-track`
- `.bar-fill`
- `.bar-value`
- `.chip-value`

Health uses `--hp-fill`; mana uses a blue gradient through `.mp-fill` or `.mana-pip`.

### Battle Panels

Battle layout uses a three-column composition on wide screens:

- enemy panel
- combat log
- player panel

Key classes:

- `#battle-top`
- `.combatant-panel`
- `.wizard-glyph`
- `.combatant-name-row`
- `.type-badge`
- `.block-display`
- `.status-row`
- `.status-chip`
- `.intent-badge`

### Spell, Reward, Shop, And Action Cards

The card language is consistent across gameplay systems:

- `.spell-card`: playable hand card with top-left mana cost
- `.reward-card`: reward choice card
- `.shop-item`: store inventory tile
- `.action-btn`: modal action tile

Common traits:

- rounded card silhouette
- muted body copy
- small top accent bar for card type
- animated hover lift

## Modal And Overlay Styling

Modal screens use:

- `.modal-shell`: centered overlay with dark backdrop
- `.modal-box`: large rounded dialog panel

Additional overlays include:

- `#card-preview-overlay`
- `#deck-view-overlay`
- `#how-to-play-overlay`

Visible overlays toggle through the `.visible` class. Overlay boxes follow the same panel styling as the rest of the site, which keeps the UI visually consistent.

## Type-Based Color Styling

Elemental color is assigned with `data-type` attributes and `.type-badge[data-type="..."]` selectors.

Supported badge types in the main stylesheet:

- `Fire`
- `Water`
- `Earth`
- `Arc`
- `Ice`
- `Shadow`
- `Light`

Each badge uses:

- tinted background
- matching text color
- border based on current color

This is the main semantic color system in the game UI.

## Motion And Effects

Motion is restrained and consistent:

- hover lift on cards and buttons
- `transition` on transform, border-color, box-shadow, opacity, and width where appropriate
- `.reveal` animation with upward fade-in
- stagger support through `.delay-1`, `.delay-2`, `.delay-3`

The single defined keyframe is `@keyframes rise`, used for staged entrance effects.

## Responsive Behavior

The site adapts at three main breakpoints in [style.css](/Users/jaredl/Documents/Wizard%20Battle/style.css):

- `1080px`: battle layout collapses from three columns to one
- `720px`: shells tighten, many flex layouts switch to grid, cards become full width, border radii and padding shrink
- `600px`: title sizing reduces further, wizard grid becomes one column, bars wrap more aggressively, spell cards shorten

The standalone reference pages also use narrow centered layouts with mobile-safe padding, though their styles are written inline rather than imported from `style.css`.

## Standalone Reference Pages

### `keywords.html`

This page follows the same brand/background system but uses document-style content blocks:

- sticky `.topbar`
- `.page-content` centered layout
- `.keyword-grid` with responsive cards
- `.keyword-card` with icon/body two-column grid
- `.pill-*` classes for mechanic chips
- `.type-*` classes for keyword type badges
- styled data table for summary content

### `type-chart.html`

This page also reuses the shared visual language and adds:

- `.wheel-section` and `.wheel-container` for the SVG relationship chart
- `.matrix-section` for the effectiveness table
- `td.eff-2`, `td.eff-1`, `td.eff-05` for matrix state coloring

## Current Styling Conventions To Preserve

When adding or updating HTML for this site, keep these patterns consistent:

- use CSS custom properties instead of hardcoding repeated colors
- prefer translucent dark panels over solid flat blocks
- keep corners rounded and shadows soft but noticeable
- use serif only for major headings, not body copy
- use uppercase spaced labels for small metadata and section tags
- keep hover motion subtle and vertical
- reuse `.shell`, `.topbar`, `.button`, `.eyebrow`, and panel classes where possible
- use `data-type` driven color styling for elemental content
- preserve safe-area padding for mobile/fullscreen surfaces

## Recommendation

The visual system is already fairly cohesive, but the styling is split between one shared stylesheet and multiple inline page styles. If you want this document to become a maintenance reference, the next useful step would be consolidating `keywords.html` and `type-chart.html` onto shared CSS tokens and shared component classes.
