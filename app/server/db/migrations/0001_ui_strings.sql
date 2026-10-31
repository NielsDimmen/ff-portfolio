CREATE TABLE `ui_strings` (
	`key` text PRIMARY KEY NOT NULL,
	`nl` text NOT NULL,
	`en` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
INSERT INTO `ui_strings` (`key`, `nl`, `en`) VALUES
	('projects', 'Projecten', 'Projects'),
	('saveContact', 'Contact opslaan', 'Save contact'),
	('allTags', 'Alles', 'All'),
	('client', 'Klant', 'Client'),
	('emptyProjects', 'Nog geen projecten.', 'No projects yet.'),
	('notFound', 'Deze pagina bestaat niet.', 'This page does not exist.'),
	('dark', 'Donker', 'Dark'),
	('light', 'Licht', 'Light');
