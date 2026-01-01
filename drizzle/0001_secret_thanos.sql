CREATE TABLE `app_settings` (
	`id` int NOT NULL DEFAULT 1,
	`current_tray_number` int NOT NULL DEFAULT 2,
	`total_trays` int NOT NULL DEFAULT 16,
	`next_tray_change_time` bigint NOT NULL,
	`last_tray_change_time` bigint,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `app_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tray_events` (
	`id` varchar(36) NOT NULL,
	`tray_number` int NOT NULL,
	`event_type` enum('remove','insert') NOT NULL,
	`timestamp` bigint NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tray_events_id` PRIMARY KEY(`id`)
);
