CREATE TABLE `summary_layout_items` (
	`id` integer PRIMARY KEY NOT NULL,
	`page_id` integer NOT NULL,
	`device` text NOT NULL,
	`widget_id` integer NOT NULL,
	`position` integer NOT NULL,
	`width` integer,
	`height` integer,
	FOREIGN KEY (`page_id`) REFERENCES `summary_layouts`(`page_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`widget_id`) REFERENCES `page_widgets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `summary_layout_items_page_idx` ON `summary_layout_items` (`page_id`);--> statement-breakpoint
CREATE INDEX `summary_layout_items_widget_idx` ON `summary_layout_items` (`widget_id`);--> statement-breakpoint
CREATE TABLE `summary_layouts` (
	`page_id` integer PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade
);
