# Tray Tracker TODO

## Database & Backend
- [x] Design database schema for tray events and settings
- [x] Create tRPC procedures for logging tray removal/insertion events
- [x] Create tRPC procedures for fetching current tray number and settings
- [x] Create tRPC procedures for dashboard analytics (by tray, day, week, month)
- [x] Implement automatic tray increment logic (every Tuesday at 7pm)
- [x] Write vitest tests for backend procedures

## Main Timer Interface
- [x] Design fun and engaging UI with playful colors and modern typography
- [x] Build large toggle button for tray removal/insertion
- [x] Implement real-time stopwatch timer
- [x] Display current tray number in UI
- [x] Show countdown to next tray change
- [x] Add smooth animations and transitions

## Reminder System
- [x] Implement 30-minute timer for removal reminders
- [x] Add browser notification support
- [x] Handle notification permissions
- [x] Add visual reminder in UI when 30 minutes exceeded

## Dashboard & Analytics
- [x] Create dashboard page with navigation
- [x] Build analytics view by tray number
- [x] Build analytics view by day
- [x] Build analytics view by week
- [x] Build analytics view by month
- [x] Add charts/visualizations for removal count and duration
- [x] Add filtering and date range selection

## Testing & Deployment
- [x] Test timer functionality
- [x] Test database logging
- [x] Test reminder notifications
- [x] Test tray auto-increment logic
- [x] Test dashboard analytics
- [x] Create checkpoint for deployment

## Daily Compliance Tracking
- [x] Add backend procedure to calculate daily wear time
- [x] Calculate compliance percentage based on 22.5-hour recommended wear time
- [x] Add compliance display to home page with percentage
- [x] Add color-coded visual feedback (green for good, yellow for warning, red for poor)
- [x] Add compliance history to dashboard
- [x] Write vitest tests for compliance calculation

## Bug Fixes
- [x] Fix backend wear time calculation - not properly subtracting out time from elapsed time

## Compliance Calculation Improvements
- [x] Change compliance percentage to use pro-rated target based on elapsed time in day
- [x] Update formula: compliance = (wearTime / (elapsedToday * 22.5/24)) * 100
- [x] Update frontend display to show pro-rated target
- [x] Update tests to verify pro-rated calculation

## Critical Bug Fixes
- [x] Fix wear time calculation showing more hours than elapsed time today (impossible scenario)
- [x] Ensure wear time never exceeds elapsed time since midnight

## UI Cleanup
- [x] Remove broken compliance panel from home page
- [x] Keep only timer, tray info, and dashboard link
