# Claude Talk to Figma MCP - Design System Rules

## Project Overview

**Name:** claude-talk-to-figma-mcp
**Version:** 0.8.2
**Type:** Model Context Protocol (MCP) plugin
**Purpose:** Bridges AI agents (Claude, Cursor, Windsurf) with Figma for reading, analyzing, and modifying designs programmatically via WebSocket.

## Tech Stack

- **Language:** TypeScript (ES2022, ESNext modules)
- **Runtime:** Node.js / Bun
- **Framework:** `@modelcontextprotocol/sdk`
- **Validation:** Zod
- **WebSocket:** `ws`
- **Build:** tsup
- **Test:** Jest + ts-jest

## Project Structure

```
src/
├── socket.ts                        # WebSocket relay server
├── claude_mcp_plugin/
│   └── manifest.json                # Figma plugin manifest
└── talk_to_figma_mcp/
    ├── server.ts                    # MCP server entry point
    ├── config/config.ts             # Server config & CLI args
    ├── types/
    │   ├── index.ts                 # Core types (FigmaCommand, FigmaResponse, etc.)
    │   └── color.ts                 # Color/ColorWithDefaults interfaces
    ├── tools/
    │   ├── index.ts                 # Tool registry (registerTools)
    │   ├── document-tools.ts        # 11 tools: get_document_info, get_selection, etc.
    │   ├── creation-tools.ts        # 10 tools: create_rectangle, create_frame, etc.
    │   ├── modification-tools.ts    # 11 tools: set_fill_color, move_node, etc.
    │   ├── text-tools.ts            # 14 tools: set_text_content, set_font_size, etc.
    │   └── component-tools.ts       # 4 tools: create_component_instance, etc.
    ├── utils/
    │   ├── websocket.ts             # WebSocket connection manager
    │   ├── figma-helpers.ts         # Color conversion (RGBA <-> Hex)
    │   ├── logger.ts                # Logging utility
    │   └── defaults.ts              # FIGMA_DEFAULTS constants
    └── prompts/index.ts             # MCP prompts (design_strategy, etc.)
```

## Token Definitions

### Color System

Colors use **normalized RGBA (0-1 range)**, not 0-255.

```typescript
// src/talk_to_figma_mcp/types/color.ts
interface Color {
  r: number;  // 0-1
  g: number;  // 0-1
  b: number;  // 0-1
  a?: number; // 0-1, optional
}

interface ColorWithDefaults {
  r: number;
  g: number;
  b: number;
  a: number;  // always defined
}
```

### Default Values

```typescript
// src/talk_to_figma_mcp/utils/defaults.ts
FIGMA_DEFAULTS = {
  color: { opacity: 1 },    // fully opaque
  stroke: { weight: 1 },    // 1px stroke
}
```

### Color Conversion

- `rgbaToHex()` in `utils/figma-helpers.ts` converts normalized RGBA to hex strings
- Alpha channel is supported throughout

## Component Architecture

### Tool Registration Pattern

All tools follow the MCP SDK pattern with Zod schema validation:

```typescript
server.tool(
  "tool_name",
  "Description of the tool",
  { param: z.string().describe("param description") },
  async (params) => ({
    content: [{ type: "text", text: JSON.stringify(result) }]
  })
);
```

### Tool Categories (5 modules, 50+ tools)

| Category | File | Count | Purpose |
|----------|------|-------|---------|
| Document | `document-tools.ts` | 11 | Read document structure, pages, selection |
| Creation | `creation-tools.ts` | 10 | Create shapes, frames, text, clone/group |
| Modification | `modification-tools.ts` | 11 | Colors, position, size, effects, layout |
| Text | `text-tools.ts` | 14 | Content, typography, alignment, styles |
| Component | `component-tools.ts` | 4 | Instances, variants, component sets |

### Adding New Tools

1. Create or edit a file in `src/talk_to_figma_mcp/tools/`
2. Export a `registerXxxTools(server: McpServer)` function
3. Register it in `tools/index.ts`
4. Define params with Zod schemas
5. Use `sendCommandToFigma()` from `utils/websocket.ts` to communicate with Figma

## Communication Architecture

```
Claude/AI Agent -> MCP Server (server.ts)
                      |
                      v
              WebSocket Relay (socket.ts) :3055
                      |
                      v
              Figma Plugin (claude_mcp_plugin)
                      |
                      v
                  Figma API
```

- **Protocol:** WebSocket (ws:// local, wss:// remote)
- **Default port:** 3055
- **Request tracking:** UUID-based with 120s timeout
- **Reconnect interval:** 2000ms
- **Progress updates:** Streamed via `progress_update` message type

## Styling Approach

This is a **backend API tool**, not a UI component library. It manipulates Figma design properties:

- **Fill/Stroke:** RGBA colors (0-1 normalized)
- **Typography:** Font name, size, weight, letter spacing, line height, text case, decoration
- **Layout:** Auto layout (flexbox-like), corner radius, positioning (x/y), sizing (w/h)
- **Effects:** Shadows, blurs via `set_effects`
- **Styles:** Text styles (`set_text_style_id`), effect styles (`set_effect_style_id`)

## Asset Management

- **Images directory:** `images/` (distribution assets only)
- **Node export:** `export_node_as_image` tool supports PNG/SVG/PDF with configurable scale
- No CDN, no bundled icon library

## Figma Design Best Practices (Built-in Prompts)

### Creating Designs
1. Start with `get_document_info()` to understand structure
2. Create parent frames first, then child elements
3. Use semantic naming: "Login Screen", "Email Input", "Logo Container"
4. Maintain hierarchy: Screen > Section > Group > Element

### Reading Designs
1. Use `get_selection()` to check current selection
2. Use `get_nodes_info()` for batch node inspection
3. Use `scan_text_nodes()` for text auditing

### Text Replacement
1. Scan and identify structure first
2. Chunk by structure (rows, cards, forms)
3. Replace progressively with verification
4. Export chunks at appropriate scales (1.0 for small, 0.2 for full design)

## Build & Run

```bash
# Build
bun run build        # Linux/macOS
bun run build:win    # Windows

# Dev mode (watch)
bun run dev

# Run
bun run start        # MCP server
bun run socket       # WebSocket relay

# Test
bun run test
bun run test:coverage
```

## Type System

Key types in `src/talk_to_figma_mcp/types/index.ts`:

- `FigmaResponse` - Command response with optional result/error
- `FigmaCommand` - Union type of all 99+ command strings
- `CommandProgressUpdate` - Progress tracking (status, progress %, chunks)
- `PendingRequest` - Request lifecycle management with timeout

## Testing

- **Framework:** Jest + ts-jest
- **Timeout:** 10 seconds per test
- **Integration tests:** `tests/integration/` (set-fill-color, set-stroke-color)
- **Fixtures:** `tests/fixtures/`
- **Coverage:** Collected from `src/**/*.{ts,tsx}`

## Conventions

- Tools use `snake_case` naming (e.g., `set_fill_color`, `get_node_info`)
- Types use `PascalCase` (e.g., `FigmaResponse`, `ColorWithDefaults`)
- Config via CLI args: `--server=`, `--port=`, `--reconnect-interval=`
- All tool responses return `{ content: [{ type: "text", text: string }] }`
- Colors always in 0-1 normalized RGBA, never 0-255

---

## 화면설계 작업 규칙

### 핵심 원칙: 기존 컴포넌트 재사용 (CRITICAL)

절대 수동으로 도형/텍스트를 새로 만들지 마라. 반드시 기존 컴포넌트를 `clone_node`로 복제해서 사용하라.

```
워크플로우: clone_node → insert_child → move_node → 텍스트/속성 수정
```

### 작업 시작 전 필수 분석

1. `get_document_info()`로 문서 구조 파악
2. `get_local_components()`로 사용 가능한 컴포넌트 목록 확인
3. 기존 화면들의 컴포넌트 ID 수집 (clone 소스용)
4. `get_styled_text_segments()`로 텍스트 스타일 패턴 확인

### 화면 배치

- 새 화면은 **(0, 0)** 또는 기존 화면 옆에 배치
- Description 컴포넌트는 메인 프레임 오른쪽 (프레임 너비 + 27px 간격)에 배치

### 디자인 토큰

#### 프레임
| 항목 | 값 |
|------|-----|
| iPhone 프레임 | 393 x 852 |
| 배경색 | #FFFFFF |

#### 색상
| 용도 | 색상 |
|------|------|
| 기본 텍스트 | #000000 |
| 보조 텍스트 | #727272 |
| 비활성 텍스트 | #A0A0A0 |
| 비활성 배경 | #F2F2F7 |
| 강조/경고 (빨간 뱃지, 활성 버튼) | #BF0F0F |
| Description 메타 값 | #00C2FF |
| Description 배경 | #F2F2F2 |

#### 타이포그래피
| 용도 | 폰트 | 크기 |
|------|------|------|
| 헤더 타이틀 | Roboto Bold | 16px |
| Description 라벨 | Noto Sans Bold | 26px |
| Description 메타 값 | Noto Sans Bold | 24px |
| Description 섹션 타이틀 | Roboto Bold | 24px |
| Description 상세 내용 | Roboto Regular | 24px |

#### 컴포넌트 규격
| 컴포넌트 | 크기 | cornerRadius |
|----------|------|-------------|
| 버튼 | 360 x 56 | 16 |
| 빨간 뱃지 | 44 x 29 | 15 |
| 체크박스 (소) | 26 x 26 | 33 |
| Description 프레임 | 585 x 가변 | 0 |

### Description 컴포넌트 구조

```
Description/화면설명 (컴포넌트)
├── Meta BG (흰색, 585 x 280)
│   ├── 화면 ID: [값]
│   ├── 화면 경로: [값]
│   ├── 화면 설명: [값]
│   └── 개발 유형: [값]
├── Desc Header BG (#F2F2F2, 585 x 59)
│   └── "Description(화면설명)" (Bold 26px, 중앙)
└── Desc Body BG (#F2F2F2, 585 x 가변)
    ├── Title 1 (Bold 24px) — "1. 영역명"
    ├── Desc 1 (Regular 24px) — "ㆍ상세 내용"
    ├── [간격 20px]
    ├── Title 2 ...
    └── ...
```

### Description 텍스트 규칙

1. **타이틀**: Bold, 번호 + 영역명 (예: `1. 헤더 영역`)
2. **상세 내용**: Regular, 각 줄 앞에 반드시 **"ㆍ"** 불릿 추가
3. **섹션 간격**: 각 섹션(Title + Desc) 사이 20px 여백
4. **Bold/Regular 분리**: 한 텍스트 노드에 혼합 스타일 불가 → 별도 노드로 분리
5. **에셋 등록**: 완성 후 `create_component_from_node`로 컴포넌트 변환

### 폰트 에러 대응 ("Cannot unwrap symbol")

혼합 스타일 텍스트 노드 수정 시 발생:
1. `load_font_async`로 폰트 로드
2. `set_font_name`으로 단일 폰트 통일
3. `set_text_content` 실행

### 작업 완료 체크리스트

- [ ] 메인 화면 프레임 (0, 0) 배치
- [ ] Description 컴포넌트 프레임 옆 배치
- [ ] 뱃지 번호 순서 확인
- [ ] Description 타이틀 Bold / 상세 Regular 분리
- [ ] 상세 줄마다 "ㆍ" 불릿
- [ ] 섹션 간 간격
- [ ] 컴포넌트 에셋 등록
