# Ski Piste Map Adaptation Plan

## Overview

This document outlines the feasibility and required tasks for adapting the **city-roads** application to map ski infrastructure (pistes, rope ways, and chairlifts) instead of roads.

---

## Feasibility Assessment

### ✅ HIGH FEASIBILITY

The adaptation is **highly feasible** for the following reasons:

1. **OpenStreetMap Data Availability**: OSM has comprehensive ski infrastructure data using well-established tagging schemes:
   - `piste:type=*` for ski runs (downhill, nordic, skitour, sled)
   - `aerialway=*` for lifts (chair_lift, gondola, cable_car, drag_lift, t-bar, etc.)
   - `piste:difficulty=*` for run difficulty ratings

2. **Existing Architecture Supports It**: The current codebase already:
   - Uses Overpass API which can query any OSM tag
   - Has a flexible query system (`Query.js`) designed for different way filters
   - Separates data fetching from rendering
   - Supports multiple layers with different colors

3. **Proven Similar Projects**: [OpenSkiMap.org](https://openskimap.org) demonstrates that OSM ski data is rich enough for comprehensive ski mapping.

---

## Primary Visual Approach

The application will use **traditional ski map color conventions**:

### Pistes: Colored by Difficulty
Each piste will be rendered as a **solid line** in its standard difficulty color:

| Difficulty | Color | Hex Code |
|------------|-------|----------|
| `novice` | 🟢 Green | `#22C55E` |
| `easy` | 🔵 Blue | `#3B82F6` |
| `intermediate` | 🔴 Red | `#EF4444` |
| `advanced` / `expert` | ⚫ Black | `#1A1A1A` |
| `freeride` | 🟠 Orange | `#F97316` |
| Unknown/untagged | ⚪ Gray | `#9CA3AF` |

### Lifts/Aerialways: Grey Dotted Lines
All mechanical lift infrastructure will be rendered as **grey dotted lines**:
- Chair lifts, gondolas, cable cars
- Drag lifts (t-bar, j-bar, platter)
- Rope tows, magic carpets

**Default lift color**: `#6B7280` (neutral grey)

This approach:
- Matches international ski map conventions
- Makes difficulty immediately visible at a glance
- Clearly distinguishes pistes from lifts
- Provides familiar visual language for skiers

### ⚠️ CHALLENGES

| Challenge | Severity | Notes |
|-----------|----------|-------|
| Dotted lines for aerialways | Medium | `w-gl` library doesn't natively support dashed/stipple lines. WebGL deprecated `glLineStipple`. Custom implementation needed. |
| Search by ski resort | Low | Nominatim can find ski resorts, but results may be less refined than city boundaries. May need to use `landuse=winter_sports` areas. |
| No pre-built cache | Low | The existing S3 cache is for roads only. Ski queries will always hit Overpass API (which is acceptable). |
| Multiple feature types | Low | Need to differentiate pistes from aerialways for styling. Current Grid.js doesn't preserve way tags. |

---

## OpenStreetMap Ski Tags Reference

### Piste Types (`piste:type=*`)

| Value | Description |
|-------|-------------|
| `downhill` | Alpine/downhill ski runs |
| `nordic` | Cross-country ski trails |
| `skitour` | Ski touring routes (backcountry) |
| `sled` | Sledding/toboggan runs |
| `hike` | Winter hiking trails |
| `sleigh` | Horse-drawn sleigh routes |

### Aerialway Types (`aerialway=*`)

| Value | Description | Suggested Style |
|-------|-------------|-----------------|
| `chair_lift` | Open chairlift | Dotted line |
| `gondola` | Enclosed cabin lift | Dotted line |
| `cable_car` | Large aerial tramway | Dotted line |
| `drag_lift` | Generic drag lift | Dotted line |
| `t-bar` | T-bar surface lift | Dotted line |
| `j-bar` | J-bar surface lift | Dotted line |
| `platter` | Button/platter lift | Dotted line |
| `rope_tow` | Rope tow lift | Dotted line |
| `magic_carpet` | Conveyor belt lift | Dotted line |

### Piste Difficulty (`piste:difficulty=*`)

| Value | Typical Color | Description |
|-------|--------------|-------------|
| `novice` | Green | Beginner slopes |
| `easy` | Blue | Easy slopes |
| `intermediate` | Red | Intermediate slopes |
| `advanced` | Black | Advanced/expert slopes |
| `expert` | Double Black | Expert only |
| `freeride` | Orange/Yellow | Unmarked off-piste |

---

## Task Breakdown

### Phase 1: Core Query Changes

#### Task 1.1: Update Query Filters
**File**: `src/lib/Query.js`

Add new static query definitions for ski infrastructure:

```javascript
// Proposed additions:
static Piste = 'way["piste:type"]';
static PisteDownhill = 'way["piste:type"="downhill"]';
static PisteNordic = 'way["piste:type"="nordic"]';
static Aerialway = 'way["aerialway"]';
static SkiAll = '(way["piste:type"]; way["aerialway"];)';
```

**Complexity**: Low
**Risk**: Low

---

#### Task 1.2: Create Combined Ski Query
**File**: `src/lib/Query.js`

The Overpass query needs to fetch both pistes and aerialways. Example query structure:

```
[timeout:900][maxsize:1073741824][out:json];
area({areaId});
(._; )->.area;
(
  way["piste:type"](area.area);
  way["aerialway"](area.area);
  node(w);
);
out skel;
```

**Complexity**: Low
**Risk**: Low

---

### Phase 2: Data Structure Enhancements

#### Task 2.1: Preserve Way Tags in Grid
**File**: `src/lib/Grid.js`

Currently `Grid.fromOSMResponse()` only stores node references for ways. To differentiate pistes from aerialways (and by difficulty), we need to preserve the `tags` object.

**Current behavior** (line 73-75):
```javascript
} else if (element.type === 'way') {
  wayPointCount += element.nodes.length;
}
```

**Required change**: Store element tags for later use in rendering:
```javascript
} else if (element.type === 'way') {
  wayPointCount += element.nodes.length;
  // Preserve tags for styling differentiation
  element.wayType = element.tags?.['piste:type'] || element.tags?.['aerialway'] || 'unknown';
  element.difficulty = element.tags?.['piste:difficulty'];
}
```

**Complexity**: Low
**Risk**: Low

---

#### Task 2.2: Update `forEachWay` to Expose Way Metadata
**File**: `src/lib/Grid.js`

The `forEachWay()` method (lines 102-126) needs to pass way metadata to the callback so the renderer can style different features differently.

**Current signature**:
```javascript
forEachWay(callback, enter, exit)
```

**Required enhancement**: The `enter` callback should receive full element metadata:
```javascript
if (enter) enter(element); // element now includes wayType, difficulty
```

**Complexity**: Low
**Risk**: Low

---

### Phase 3: Rendering Changes

#### Task 3.1: Implement Difficulty-Based Line Collections
**File**: `src/lib/GridLayer.js`

Instead of a single `WireCollection`, create **separate collections for each category**:

**Piste Collections (solid lines, one per difficulty):**
```javascript
const pisteCollections = {
  novice:       new WireCollection(count, { width: 2 }),      // Green
  easy:         new WireCollection(count, { width: 2 }),      // Blue
  intermediate: new WireCollection(count, { width: 2 }),      // Red
  advanced:     new WireCollection(count, { width: 2 }),      // Black
  expert:       new WireCollection(count, { width: 2 }),      // Black
  freeride:     new WireCollection(count, { width: 2 }),      // Orange
  unknown:      new WireCollection(count, { width: 2 }),      // Gray
};
```

**Aerialway Collection (grey dotted lines):**
```javascript
const aerialwayCollection = new WireCollection(count, { width: 1.5 }); // Grey
```

Each collection gets its designated color from the difficulty color scheme.

**Complexity**: Medium
**Risk**: Medium

---

#### Task 3.2: Implement Dotted Lines for Aerialways
**Files**: `src/lib/GridLayer.js`, potentially new shader files

**Challenge**: The `w-gl` library's `WireCollection` only supports solid lines. WebGL does not have native line stipple support.

**Options**:

| Option | Pros | Cons |
|--------|------|------|
| **A. Simulated dots** - Draw many short line segments with gaps | Simple, uses existing WireCollection | Performance impact with many segments |
| **B. Custom shader** - Modify w-gl or add custom shader | Best visual quality, performant | Requires WebGL shader knowledge, more complex |
| **C. Marker approach** - Place dot symbols along the line | Distinctive appearance | May look cluttered, performance concerns |
| **D. Different visual** - Use different color/opacity instead of dots | Simplest to implement | Doesn't match traditional ski map conventions |

**Recommended approach**: Start with **Option A** (simulated dots) for initial implementation, then consider **Option B** (custom shader) for optimization if needed.

**Simulated dot algorithm**:
```javascript
// For each aerialway segment (from, to):
const distance = Math.hypot(to.x - from.x, to.y - from.y);
const dotLength = 5;   // pixels
const gapLength = 5;   // pixels
const segmentLength = dotLength + gapLength;
const numSegments = Math.floor(distance / segmentLength);

for (let i = 0; i < numSegments; i++) {
  const startRatio = (i * segmentLength) / distance;
  const endRatio = (i * segmentLength + dotLength) / distance;

  const dotFrom = lerp(from, to, startRatio);
  const dotTo = lerp(from, to, endRatio);

  lines.add({ from: dotFrom, to: dotTo });
}
```

**Complexity**: Medium-High
**Risk**: Medium (performance and visual quality unknowns)

---

#### Task 3.3: Apply Difficulty Colors to Collections
**File**: `src/lib/GridLayer.js`

Apply the standard ski map colors to each piste collection:

```javascript
const DIFFICULTY_COLORS = {
  novice:       '#22C55E',  // Green
  easy:         '#3B82F6',  // Blue
  intermediate: '#EF4444',  // Red
  advanced:     '#1A1A1A',  // Black
  expert:       '#1A1A1A',  // Black (same as advanced)
  freeride:     '#F97316',  // Orange
  unknown:      '#9CA3AF',  // Gray (fallback)
};

const AERIALWAY_COLOR = '#6B7280';  // Neutral grey for all lifts

// Apply colors to collections
Object.entries(pisteCollections).forEach(([difficulty, collection]) => {
  collection.color = toRatioColor(tinycolor(DIFFICULTY_COLORS[difficulty]).toRgb());
});
aerialwayCollection.color = toRatioColor(tinycolor(AERIALWAY_COLOR).toRgb());
```

The UI should still allow customization of these colors if users prefer different schemes.

**Complexity**: Low
**Risk**: Low

---

### Phase 4: UI/UX Updates

#### Task 4.1: Update Branding and Text
**Files**: `src/components/FindPlace.vue`, `src/App.vue`, `src/index.html`

| Current Text | New Text |
|--------------|----------|
| "city roads" | "ski roads" or "piste map" |
| "This website renders every single road within a city" | "This website renders ski pistes and lifts within ski resorts" |
| "Enter a city name to start" | "Enter a ski resort name to start" |
| "Find City Bounds" | "Find Ski Resort" |
| "Didn't find matching cities" | "Didn't find matching ski resorts" |
| "Try another city" | "Try another resort" |

**Complexity**: Low
**Risk**: Low

---

#### Task 4.2: Update Search to Target Ski Areas
**File**: `src/lib/findBoundaryByName.js`

The Nominatim search could be enhanced to prefer `landuse=winter_sports` or ski resort results. Consider adding query parameters or filtering results.

**Complexity**: Low-Medium
**Risk**: Low

---

#### Task 4.3: Update Color Picker UI
**File**: `src/App.vue`

Add color pickers for each category:

**Piste difficulty colors:**
- 🟢 Novice (green)
- 🔵 Easy (blue)
- 🔴 Intermediate (red)
- ⚫ Advanced/Expert (black)
- 🟠 Freeride (orange)

**Infrastructure:**
- Lifts/Aerialways (grey)

**Display:**
- Background (white)
- Labels (dark)

Users can customize any of these colors while defaults match ski map conventions.

**Complexity**: Medium (more color pickers than current implementation)
**Risk**: Low

---

#### Task 4.4: Add Legend/Key
**File**: New component `src/components/Legend.vue`

A legend explaining the color scheme:

```
┌─────────────────────────────┐
│  LEGEND                     │
├─────────────────────────────┤
│  ───── Green   Novice       │
│  ───── Blue    Easy         │
│  ───── Red     Intermediate │
│  ───── Black   Advanced     │
│  ───── Orange  Freeride     │
│  · · · Grey    Lifts        │
└─────────────────────────────┘
```

The legend should be:
- Toggleable (can hide for cleaner export)
- Positioned in corner (draggable like city name)
- Included in PNG/SVG exports

**Complexity**: Low-Medium
**Risk**: Low

---

### Phase 5: Configuration and Defaults

#### Task 5.1: Update Default Colors
**File**: `src/config.js`

```javascript
// Difficulty color scheme (standard ski map conventions)
const DIFFICULTY_COLORS = {
  novice:       '#22C55E',  // Green - beginner
  easy:         '#3B82F6',  // Blue - easy
  intermediate: '#EF4444',  // Red - intermediate
  advanced:     '#1A1A1A',  // Black - advanced
  expert:       '#1A1A1A',  // Black - expert
  freeride:     '#F97316',  // Orange - off-piste
  unknown:      '#9CA3AF',  // Gray - untagged
};

// Lift/aerialway color
const AERIALWAY_COLOR = '#6B7280';  // Neutral grey

export default {
  getDifficultyColors() {
    return DIFFICULTY_COLORS;
  },
  getAerialwayColor() {
    return tinycolor(AERIALWAY_COLOR);
  },
  getBackgroundColor() {
    return tinycolor('#FFFFFF'); // White (snow)
  },
  getLabelColor() {
    return tinycolor('#1A1A1A'); // Dark for contrast on white
  }
}
```

**Complexity**: Low
**Risk**: Low

---

#### Task 5.2: Disable S3 Cache for Ski Queries
**File**: `src/components/FindPlace.vue`

The existing cache at `city-roads.s3-us-west-2.amazonaws.com` contains road data only. For ski mapping:
- Always query Overpass API directly
- Or build a new ski-specific cache (future enhancement)

**Complexity**: Low
**Risk**: Low

---

### Phase 6: Export Updates

#### Task 6.1: Update SVG Export for Dotted Lines
**File**: `src/lib/svgExport.js`

If using simulated dots in WebGL, the SVG export should either:
- Export the same short segments (preserves visual accuracy)
- Or generate proper SVG `stroke-dasharray` attributes for cleaner output

**Complexity**: Medium
**Risk**: Low

---

#### Task 6.2: Update Export Metadata
**File**: `src/lib/svgExport.js`

Update the SVG comment header:
```javascript
open() {
  return `<!-- Generator: ski-roads (based on city-roads)
Data © OpenStreetMap contributors, ODbL 1.0. https://osm.org/copyright
-->`;
}
```

**Complexity**: Low
**Risk**: Low

---

## Implementation Priority Order

| Priority | Phase | Task | Effort |
|----------|-------|------|--------|
| 1 | 1 | Query filter changes (1.1, 1.2) | 1-2 hours |
| 2 | 2 | Grid data structure updates (2.1, 2.2) | 1-2 hours |
| 3 | 5 | Configuration - difficulty colors & defaults (5.1) | 1 hour |
| 4 | 3 | Difficulty-based collections (3.1) | 2-3 hours |
| 5 | 3 | Apply difficulty colors (3.3) | 1-2 hours |
| 6 | 3 | Grey dotted lines for lifts (3.2) | 4-8 hours |
| 7 | 4 | UI text/branding updates (4.1) | 1-2 hours |
| 8 | 5 | Disable cache for ski queries (5.2) | 0.5 hours |
| 9 | 4 | Color picker updates for all difficulty levels (4.3) | 2-3 hours |
| 10 | 6 | Export updates (6.1, 6.2) | 2-3 hours |
| 11 | 4 | Legend component (4.4) | 2-3 hours |
| 12 | 4 | Search improvements (4.2) | 2-3 hours |

**Estimated Total Effort**: 20-35 hours

### Core Feature Summary
The **minimum viable product** requires tasks 1-7:
- Difficulty-colored pistes (green/blue/red/black)
- Grey dotted lines for all lifts
- Updated branding

Tasks 8-12 are enhancements that improve the user experience.

---

## Technical Risks and Mitigations

### Risk 1: Dotted Line Performance
**Risk**: Simulating dots with many short line segments could impact rendering performance for large ski resorts.

**Mitigation**:
- Start with moderate dot/gap ratios
- Profile performance with real-world data
- Consider LOD (level of detail) - use solid lines when zoomed out
- Fall back to custom shader if needed

### Risk 2: Ski Resort Boundaries
**Risk**: Unlike cities, ski resorts may not have well-defined administrative boundaries in OSM.

**Mitigation**:
- Use bounding box queries as fallback
- Search for `landuse=winter_sports` areas
- Allow manual coordinate/bounding box input

### Risk 3: Mixed Data Quality
**Risk**: OSM ski data quality varies significantly by region. Some resorts have excellent coverage, others have minimal data.

**Mitigation**:
- Show warning when results seem incomplete
- Provide links to contribute to OSM
- Consider showing base imagery or elevation data as context

---

## Files to Modify Summary

| File | Changes Required |
|------|-----------------|
| `src/lib/Query.js` | Add ski query filters |
| `src/lib/Grid.js` | Preserve way tags/metadata |
| `src/lib/GridLayer.js` | Multiple collections, dotted lines |
| `src/lib/createScene.js` | Handle multiple layer types |
| `src/config.js` | Update default colors |
| `src/App.vue` | UI updates, color pickers |
| `src/components/FindPlace.vue` | Text updates, cache bypass |
| `src/lib/svgExport.js` | Dotted line export, metadata |
| `src/index.html` | Title, meta tags |

---

## Testing Recommendations

### Test Ski Resorts (Known Good OSM Data)
- Chamonix, France
- Zermatt, Switzerland
- Whistler, Canada
- Park City, USA
- Niseko, Japan

### Overpass Test Query
Test this query in [Overpass Turbo](https://overpass-turbo.eu/) to validate data availability:

```
[out:json][timeout:60];
area["name"="Chamonix-Mont-Blanc"]->.searchArea;
(
  way["piste:type"](area.searchArea);
  way["aerialway"](area.searchArea);
);
out body;
>;
out skel qt;
```

---

## Future Enhancements (Out of Scope)

1. **Elevation profiles** - Show altitude along pistes
2. **3D terrain** - Render over DEM data
3. **Ski area statistics** - Total km of runs, number of lifts
4. **Real-time status** - Integrate with lift status APIs
5. **Multi-resort view** - Combine nearby resorts
6. **Print optimization** - Ski map poster layouts

---

## Conclusion

Adapting city-roads for ski mapping is **technically feasible** with moderate effort.

### Primary Approach
- **Pistes colored by difficulty**: Green (novice), Blue (easy), Red (intermediate), Black (advanced), Orange (freeride)
- **Lifts as grey dotted lines**: All aerialways rendered in neutral grey with dotted line style

### Key Challenges
1. **Dotted lines for lifts** - Requires either simulating dots with short line segments or implementing a custom WebGL shader
2. **Multiple WireCollections** - Need one per difficulty level plus one for lifts

### Why This Will Work
The application's clean architecture with separation of concerns (Query → Grid → GridLayer → Scene) makes it well-suited for this adaptation. The existing multi-layer support and color customization UI provide a solid foundation for the difficulty-based color scheme.

The result will be a familiar, intuitive ski map visualization that any skier can immediately understand.
