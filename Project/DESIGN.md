# Design System & UI Specifications — SyncMeet AI

---

## 1. Visual Theme & Brand Identity
* **Design Tone**: High-focus, immersive dark mode aesthetic engineered for prolonged video calls. Crystal-clear contrast with refined glassmorphism, subtle glowing borders for active speakers, and vibrant indigo/emerald accents for AI actions.

---

## 2. Color System & Design Tokens (Tailwind CSS Mappings)

### Surface & Background Tokens
* `bg-surface-canvas`: `#0A0D14` (Deepest canvas background)
* `bg-surface-elevated`: `#121826` (Sidebar, modals, cards)
* `bg-surface-tile`: `#1A2234` (Video placeholder & participant tiles)
* `bg-surface-dock`: `rgba(18, 24, 38, 0.85)` (Floating blur backdrop filter `backdrop-blur-md`)
* `border-subtle`: `rgba(255, 255, 255, 0.08)`
* `border-focus`: `rgba(99, 102, 241, 0.5)` (Indigo-500)

### Primary & Accent Colors
* **Primary Indigo**: `#6366F1` (Indigo-500) / `#4F46E5` (Indigo-600) — Primary CTAs, active selections
* **AI Intelligence Emerald / Teal**: `#10B981` (Emerald-500) / `#06B6D4` (Cyan-500) — AI generation status, active speech bubbles, sparkles
* **Live Recording Pulse Red**: `#EF4444` (Red-500) — Recording indicator, Mute status, End call button
* **Warning / Jitter Amber**: `#F59E0B` (Amber-500) — Network warnings, device permission alerts

### Text & Content Tokens
* `text-primary`: `#F9FAFB` (Gray-50) — Headings, participant names
* `text-secondary`: `#9CA3AF` (Gray-400) — Transcripts, timestamps, subtitles
* `text-muted`: `#6B7280` (Gray-500) — Inactive tabs, shortcuts, placeholders

---

## 3. Typography Hierarchy (Inter / Plus Jakarta Sans)

| Level | Size | Weight | Line Height | Tracking | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Display / Hero** | `28px (1.75rem)` | `700 (Bold)` | `36px` | `-0.02em` | Pre-meeting lobby title |
| **Heading 1** | `20px (1.25rem)` | `600 (SemiBold)` | `28px` | `-0.01em` | Sidebar headers, modal titles |
| **Heading 2 / Section**| `16px (1.0rem)` | `600 (SemiBold)` | `24px` | `0` | AI Note section headings |
| **Body (Primary)** | `14px (0.875rem)`| `400 (Regular)` | `22px` | `0` | Live transcripts, note content |
| **Body (Medium)** | `14px (0.875rem)`| `500 (Medium)` | `22px` | `0` | Action items, buttons |
| **Caption / Meta** | `12px (0.75rem)` | `500 (Medium)` | `16px` | `+0.01em` | Timestamps, speaker tags |

---

## 4. Component Token Specifications

### 4.1 Floating Control Dock
* **Position**: Fixed bottom center, floating 24px above viewport bottom.
* **Styling**: `bg-surface-dock border border-white/10 rounded-2xl p-2.5 shadow-2xl backdrop-blur-xl flex items-center gap-3`.
* **Button States**:
  * **Standard Action** (`44x44px` round): `bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all duration-150 active:scale-95`.
  * **Active Toggle (e.g. Muted / Cam Off)**: `bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30`.
  * **AI Notes Action**: `bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-lg shadow-indigo-500/25 hover:opacity-90`.
  * **Leave Call Button**: `bg-red-600 hover:bg-red-700 text-white px-5 h-11 rounded-xl font-medium flex items-center gap-2`.

### 4.2 Dynamic Video Tile
* **Border Radius**: `rounded-2xl`
* **Aspect Ratio**: Fluid `16:9` with `object-cover` video stream.
* **Active Speaker Highlight**: `ring-2 ring-emerald-500/80 shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all duration-300`.
* **Tile Overlays**:
  * Bottom Left: Participant Name + Mic Status pill (`bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-lg text-xs font-medium`).
  * Top Right: Network Connection Quality indicator (3 green/yellow bars).

### 4.3 Live Transcript Stream Item
* **Bubble Styling**: `p-3 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] transition-colors`.
* **Header**: Speaker Avatar (`20x20px`) + Name (`text-xs font-semibold text-indigo-400`) + Timestamp (`text-[10px] text-gray-500`).
* **Content**: Clean high-contrast text (`text-sm text-gray-200`).

### 4.4 AI Notes & Summary Card
* **Container**: `bg-gradient-to-b from-indigo-950/30 to-surface-elevated border border-indigo-500/20 rounded-2xl p-4`.
* **Section Chips**: `bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded-md text-xs font-semibold`.
* **Action Items**: Interactive checkbox list with priority badges (`High: red-500/20`, `Med: amber-500/20`, `Low: blue-500/20`).

---

## 5. Animation & Micro-Interactions (Framer Motion / CSS)
* **Audio Visualizer Pulse**: 5-bar vertical equalizer responding dynamically to audio input levels (`scaleY(0.2)` to `scaleY(1.0)`).
* **AI Generation Shimmer**: Subtle animated gradient shimmer along the AI note header during active streaming.
* **Tile Transition**: Smooth 200ms `ease-out` grid reflow when participants join/leave or screen-sharing begins.
* **Reduced Motion Compliance**: `@media (prefers-reduced-motion: reduce)` disables scale bounces and continuous shimmers.

---

## 6. Icons & Asset Specifications (Lucide React)
* `Mic`, `MicOff`, `Video`, `VideoOff`, `MonitorUp` (Screen share)
* `Sparkles` (AI notes trigger), `FileText` (Transcript)
* `Copy`, `Download`, `Check`, `Settings`, `PhoneOff`, `Users`, `MessageSquare`
* `Volume2`, `AlertCircle`, `Wifi`, `WifiOff`

---

## 7. Responsive Breakpoints

| Breakpoint | Width | Media Grid Layout | Sidebar Behavior |
| :--- | :--- | :--- | :--- |
| **Desktop (XL)** | `> 1280px` | 2x2 or 3x2 Grid + 380px Sidebar | Side-by-side fixed panel |
| **Laptop (MD)** | `768px - 1279px`| 2x2 Grid + 320px Sidebar | Side-by-side or collapsible drawer |
| **Mobile (SM)** | `< 768px` | 1-column scroll / Spotlight + PiP | Bottom Sheet overlay modal |