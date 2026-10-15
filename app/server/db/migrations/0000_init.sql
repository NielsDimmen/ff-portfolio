CREATE TABLE `home_blocks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`block_key` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "home_blocks_key_check" CHECK("home_blocks"."block_key" in ('hero', 'intro', 'featured', 'contact'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `home_blocks_block_key_unique` ON `home_blocks` (`block_key`);--> statement-breakpoint
CREATE TABLE `media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`original_filename` text NOT NULL,
	`mime` text NOT NULL,
	`byte_size` integer DEFAULT 0 NOT NULL,
	`width` integer,
	`height` integer,
	`alt_nl` text DEFAULT '' NOT NULL,
	`alt_en` text DEFAULT '' NOT NULL,
	`focal_x` real DEFAULT 0.5 NOT NULL,
	`focal_y` real DEFAULT 0.5 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title_nl` text NOT NULL,
	`title_en` text DEFAULT '' NOT NULL,
	`body_nl` text DEFAULT '' NOT NULL,
	`body_en` text DEFAULT '' NOT NULL,
	`seo_description_nl` text DEFAULT '' NOT NULL,
	`seo_description_en` text DEFAULT '' NOT NULL,
	`show_in_nav` integer DEFAULT false NOT NULL,
	`nav_order` integer DEFAULT 0 NOT NULL,
	`published` integer DEFAULT false NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pages_slug_unique` ON `pages` (`slug`);--> statement-breakpoint
CREATE TABLE `project_media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`media_id` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`caption_nl` text DEFAULT '' NOT NULL,
	`caption_en` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_media_project_sort_idx` ON `project_media` (`project_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `project_tags` (
	`project_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`project_id`, `tag_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title_nl` text NOT NULL,
	`title_en` text DEFAULT '' NOT NULL,
	`client` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`year` integer,
	`date_start` text,
	`date_end` text,
	`role_nl` text DEFAULT '' NOT NULL,
	`role_en` text DEFAULT '' NOT NULL,
	`summary_nl` text DEFAULT '' NOT NULL,
	`summary_en` text DEFAULT '' NOT NULL,
	`body_nl` text DEFAULT '' NOT NULL,
	`body_en` text DEFAULT '' NOT NULL,
	`cover_media_id` integer,
	`video_url` text,
	`featured` integer DEFAULT false NOT NULL,
	`published` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`cover_media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_slug_unique` ON `projects` (`slug`);--> statement-breakpoint
CREATE INDEX `projects_published_sort_idx` ON `projects` (`published`,`sort_order`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`site_name` text NOT NULL,
	`tagline_nl` text DEFAULT '' NOT NULL,
	`tagline_en` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`whatsapp` text DEFAULT '' NOT NULL,
	`instagram` text DEFAULT '' NOT NULL,
	`linkedin` text DEFAULT '' NOT NULL,
	`logo_media_id` integer,
	`favicon_media_id` integer,
	`og_image_media_id` integer,
	`default_lang` text DEFAULT 'nl' NOT NULL,
	`accent_color` text,
	`vcf_name` text DEFAULT '' NOT NULL,
	`vcf_company` text DEFAULT '' NOT NULL,
	`vcf_title` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`logo_media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`favicon_media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`og_image_media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "settings_singleton_check" CHECK("settings"."id" = 1),
	CONSTRAINT "settings_default_lang_check" CHECK("settings"."default_lang" in ('nl', 'en'))
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name_nl` text NOT NULL,
	`name_en` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_slug_unique` ON `tags` (`slug`);