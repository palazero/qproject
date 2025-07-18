# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Essential Commands
- `npm run dev` or `quasar dev` - Start development server with hot-reload
- `npm run build` or `quasar build` - Build for production
- `npm run lint` - Run ESLint on source files
- `npm run format` - Format files with Prettier
- `npm test` - Currently no tests configured (returns exit 0)

### Installation
- `npm install` or `yarn` - Install dependencies
- `npm run postinstall` - Runs `quasar prepare` automatically after install

## Project Architecture

This is a **Quasar Framework** Vue 3 application with the following structure:

### Framework Stack
- **Vue 3** with Composition API
- **Quasar Framework** for UI components
- **Pinia** for state management
- **Vue Router** for routing
- **Vue I18n** for internationalization
- **Axios** for HTTP requests
- **Vite** as build tool

### Key Architecture Patterns
- **Boot Files**: `src/boot/` - Application initialization (axios, i18n)
- **Layouts**: `src/layouts/` - Page layouts (MainLayout.vue)
- **Pages**: `src/pages/` - Route components
- **Components**: `src/components/` - Reusable Vue components
- **Stores**: `src/stores/` - Pinia stores for state management
- **Router**: `src/router/` - Vue Router configuration

### Build Configuration
- Main config: `quasar.config.js` - Quasar CLI configuration
- Router mode: Hash mode (configurable in quasar.config.js)
- Target browsers: ES2022, Firefox 115+, Chrome 115+, Safari 14+
- Node target: Node 20+

### Boot System
Boot files are loaded automatically and run before the app starts:
- `i18n.js` - Sets up Vue I18n with locale 'en-US'
- `axios.js` - Configures axios with base URL and global properties

### Quasar Plugins & Components
Configured plugins in `quasar.config.js`:
- **Notify** - For toast notifications (`$q.notify()`)
- **Dialog** - For confirmation dialogs (`$q.dialog()`)

Auto-imported components include:
- Layout components (QLayout, QHeader, QDrawer, etc.)
- Form components (QForm, QInput, QSelect, etc.) 
- UI components (QBtn, QCard, QChip, etc.)
- Navigation components (QMenu, QTooltip, etc.)

Auto-imported directives:
- `v-ripple` - Material design ripple effect
- `v-close-popup` - Close popup on click

### State Management
- Uses Pinia store system
- Store initialization in `src/stores/index.js`
- Example store template in `src/stores/example-store.js`

## Development Notes

### Quasar CLI Usage
- Uses Quasar CLI with Vite for modern build tooling
- Supports multiple deployment targets (SPA, SSR, PWA, Mobile, Electron)
- Auto-import of Quasar components and utilities

### Code Style
- ESLint configuration with flat config format
- Prettier for code formatting
- Vue 3 Composition API preferred
- Uses `#q-app/wrappers` for Quasar-specific definitions

### Important Files
- `quasar.config.js` - Main framework configuration
- `src/App.vue` - Root component (minimal, just router-view)
- `src/layouts/MainLayout.vue` - Main application layout with drawer
- `src/router/routes.js` - Route definitions

## Task Management System

### Core Features
- **Task CRUD Operations** - Create, read, update, delete, duplicate tasks
- **Hierarchical Task Structure** - Parent-child relationships with unlimited nesting
- **Compact List Design** - Single-line task items for better information density
- **Action Menu System** - Context menu for task operations (edit, duplicate, delete)
- **Drag & Drop Sorting** - Using vuedraggable for task reordering
- **Expand/Collapse Controls** - Expand all or collapse all tasks in list view
- **Gantt Chart View** - dhtmlxGantt integration for timeline visualization
- **Dependency Management** - Task dependencies with circular dependency detection
- **Real-time Filtering** - Filter by status, priority, tags, assignee, date range
- **LocalStorage Persistence** - Auto-save with 500ms debounce
- **Status Animations** - Visual feedback for task state changes
- **Task Statistics** - Real-time count of total, completed, in-progress tasks

### Key Components
- `src/stores/taskStore.js` - Pinia store for task management
- `src/pages/TaskManagerPage.vue` - Main task management interface
- `src/components/TaskList.vue` - Recursive task tree with drag-drop
- `src/components/TaskItem.vue` - Individual task display with animations
- `src/components/TaskEditDialog.vue` - Task creation/editing form
- `src/components/GanttView.vue` - dhtmlxGantt wrapper component
- `src/components/FilterBar.vue` - Advanced filtering interface

### Task Data Structure
```javascript
{
  id: 'uuid',
  parentId: 'parent-uuid' | null,
  title: 'Task Title',
  description: 'Task Description',
  startTime: '2025-01-01T09:00:00',
  endTime: '2025-01-01T17:00:00',
  assignee: 'user.name',
  status: 'todo' | 'in_progress' | 'done' | 'blocked',
  priority: 'low' | 'medium' | 'high',
  tags: ['tag1', 'tag2'],
  dependencies: ['dep-uuid1', 'dep-uuid2'],
  sortOrder: 1,
  createdAt: 'ISO string',
  updatedAt: 'ISO string'
}
```

### Dependencies
- `vuedraggable@4` - Drag and drop functionality
- `dhtmlx-gantt` - Gantt chart visualization  
- `uuid` - Unique identifier generation

### Gantt Chart Troubleshooting

If the Gantt chart is not displaying properly, check:

1. **Container Height**: Ensure the gantt container has explicit height
2. **Data Format**: Verify tasks have `start_date` in 'YYYY-MM-DD' format
3. **Initialization Timing**: Use setTimeout to delay initialization after container render
4. **dhtmlxGantt CSS**: Ensure 'dhtmlx-gantt/codebase/dhtmlxgantt.css' is imported

Common fixes implemented:
- **Container Height**: Added explicit height (600px) to gantt container
- **Initialization Timing**: Delayed initialization by 100ms after mount
- **Data Safety**: Added sample data fallback when no tasks exist
- **Link Validation**: Added null checks for link data to prevent undefined errors
- **Modern API**: Updated to use `gantt.config.scales` instead of deprecated scale config
- **Temporary Safety**: Disabled drag_links temporarily to avoid link-related errors
- **Debug Support**: Added console logging for data verification
- **Date Format**: Fixed date format consistency in ganttData getter

Known limitations:
- Link/dependency drag-and-drop temporarily disabled for stability
- Focus on basic Gantt display functionality first

### UI Design Philosophy

**Compact List View**:
- Single-line task items (36px height) for maximum information density
- Essential information visible at a glance: status, priority, title, assignee, date
- Action menu replaces individual buttons to reduce UI clutter
- Responsive design adapts to mobile screens

**Information Hierarchy**:
- Primary: Task title (clickable for editing)
- Secondary: Status indicator, priority badge, progress indicator
- Tertiary: Tags, assignee, dates (truncated if needed)
- Actions: Hidden in menu until needed

**Visual Indicators**:
- Color-coded status backgrounds (blocked=red, in-progress=blue, done=green)
- Priority badges with distinct colors (high=red, medium=orange, low=purple)
- Progress shown as circular indicator for in-progress tasks
- Dependency warnings shown as link icons