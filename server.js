//Made by Lumaa

// This is the server-side code for Artisticly, it first requires to edit the `config.json` file with the code given in the client-side app.

const local = require("local-ip-address");
const mm = require("music-metadata");
const express = require("express");
const { fs } = require("file-system");
const {
	port,
	version,
	name,
	configured,
	accessCode,
	serverUpdater,
} = require("./config.json");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get("/", (_, res) =>
	res.status(200).json({ versions: version, username: name, artisticly: true })
);

// Start the server
async function forceStart() {
	if (!fs.existsSync("./songs")) {
		console.log(
			'[Artisticly] - Please create a "songs" folder in the root directory.'
		);
		return;
	}

	let latest = await isLatestVersion()

	app.listen(port, () => {
		console.log(
			`--o--\n\n\n\n\n\n\n\n\n\n\n\n--o--\n[Artisticly] - Server started successfully on port ${port}.${latest ? '\n\n' : '\n\n/!\\ There is a new server-version available on https://github.com/lumaa-dev/ArtisticlyServer/releases/latest\n\n'}Local: http://localhost:${port}\nNetwork: http://${local()}:${port}\n--o--`
		);
	});
}

// GET calls
app.get("/musics", async (req, res) => {
	const { p, l } = req.body;

	let page = Math.min((p ?? 1) - 1, 20);
	let limit = Math.min(l ?? 20, 45);
	let includesHidden = isCorrectCode(req);

	if (fs.existsSync("./songs")) {
		var songs = fs.readdirSync("./songs");
		songs = songs.filter((el) => {
			return el.endsWith("mp3") || el.endsWith("wav") || el.endsWith("m4a");
		});

		if (!includesHidden) {
			songs = songs.filter((el) => {
				return el.split(/\-+/g, 2)[1] == "1";
			});
		}

		songs = songs.slice(
			limit * page,
			Math.min(songs.length, limit * (page + 1))
		);

		for (let i = 0; i < songs.length; i++) {
			const el = songs[i];
			let fullPath = `${__dirname}/songs/${el}`

			var { common: metadata } = await mm.parseFile(fullPath)
			let artwork = typeof metadata.picture !== 'undefined' ? metadata.picture[0].data.toString("base64") : ""

			songs[i] = {
				id: Number(el.split(/\-+/g)[0]),
				metadata: {
					name: metadata.title ?? "Unknown Song",
					artist: metadata.artist ?? "Unknown Artist",
					album: metadata.album ?? "Unknown Album",
					artwork: artwork
				}
			};
		}
		return res.status(200).json(songs);
	} else {
		console.log(
			'[Artisticly] - Please create a "songs" folder in the root directory.'
		);
		return res.status(301).json({ error: "Songs folder is missing" });
	}
});

app.get("/music/:id", (req, res) => {
	const { id } = req.params;
	let includesHidden = isCorrectCode(req);

	if (fs.existsSync("./songs")) {
		var songs = fs.readdirSync("./songs");
		let song = songs.filter((el) => {
			return (
				el.startsWith(includesHidden ? `${id}` : `${id}-1`) &&
				(el.endsWith("mp3") || el.endsWith("wav") || el.endsWith("m4a"))
			);
		})[0];

		if (!song) {
			return res
				.status(301)
				.json({ error: "Song is missing or does not exists" });
		}

		return res.status(200).sendFile(`${__dirname}/songs/${song}`);
	} else {
		console.log(`[Artisticly] - Song with ID "${id}" does not exist.`);
		return res
			.status(301)
			.json({ error: "Song is missing or does not exists" });
	}
});

/**
 * Checks if the code received from a client is the one chosen by the server admin
 * @param {Request} request The request received from a client
 * @returns {Boolean} Returns `true`, if the code matches
 */
function isCorrectCode(request) {
	let sentCode = request.credentials;
	return sentCode == accessCode;
}

/**
 * The function `isLatestVersion` checks if the current server version matches the latest version
 * available using the [GitHub repository](https://github.com/lumaa-dev/ArtisticlyServer).
 * @returns {Promise<Boolean>} If set to true, the current version is the latest available.
 */
async function isLatestVersion() {
	const releases = await fetch(`${serverUpdater}`).then(async (res) => await res.json())
	let latestVersion = releases[0]['tag_name']

	return latestVersion == version.server;
}

if (configured) {
	forceStart();
} else {
	console.log("[Artisticly] - You have not updated your server's settings.");
}
