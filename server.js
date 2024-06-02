//Made by Lumaa

// This is the server-side code for Artisticly, it first requires to edit the `config.json` file with the code given in the client-side app.

const fetch = require("node-fetch");
const local = require("local-ip-address");
const mm = require("music-metadata");
const express = require("express");
const { fs } = require("file-system");
const spotify = require("./spotify.js");
const {
	port,
	version,
	name,
	configured,
	accessCode,
	serverUpdater,
} = require("./config.json");
const cors = require("cors");

const app = express();

app.use(cors())
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

	let latest = await isLatestVersion();

	app.listen(port, () => {
		console.log(
			`--o--\n\n\n\n\n\n\n\n\n\n\n\n--o--\n[Artisticly v${version.server}] - Server started successfully on port ${port}.${latest ? `\n\nBuilt for client v${version.client}\n\n` : "\n\n/!\\ There is a new server-version available on https://github.com/lumaa-dev/ArtisticlyServer/releases/latest\n\n"}Local: http://localhost:${port}\nNetwork: http://${local()}:${port}\n--o--`
		);
	});
}

// GET calls
app.get("/musics", async (req, res) => {
	const { p, l, q: query, type: searchType } = req.query;

	let page = Math.min((p ?? 1) - 1, 20);
	let limit = Math.min(l ?? 20, 45);
	let isQueryId = !isNaN(Number(query));
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

		songs.sort(function (a, b) {
			return Number(a.split(/\-+/g, 2)[0]) - Number(b.split(/\-+/g, 2)[0]);
		});

		for (let i = 0; i < songs.length; i++) {
			const el = songs[i];
			let fullPath = `${__dirname}/songs/${el}`;

			var { common: metadata } = await mm.parseFile(fullPath);
			let artwork =
				typeof metadata.picture !== "undefined"
					? metadata.picture[0].data.toString("base64")
					: "";

			songs[i] = {
				id: Number(el.split(/\-+/g)[0]),
				metadata: {
					name: metadata.title ?? "Unknown Song",
					artist: metadata.artist ?? "Unknown Artist",
					album: metadata.album ?? "Unknown Album",
					artwork: artwork,
				},
			};
		}

		if (typeof query == "string") {
			if (isQueryId) {
				let song = songs.filter((el) => {
					return el["id"] == Number(query);
				})[0];
				return res.status(200).json(song);
			} else {
				let availableTypes = ["title", "album", "artist"];
				if (typeof searchType == "string") {
					if (availableTypes.includes(searchType.toLowerCase())) {
						let results = searchSong(songs, query.toLowerCase(), searchType);
						let originalCount = results.length;

						// searching only allows 10 results
						results = results.slice(
							10 * page,
							Math.min(results.length, 10 * (page + 1))
						);

						return res.status(200).json({ results, count: originalCount });
					} else {
						return res.status(301).json({ error: "Type is incorrect" });
					}
				} else {
					return res.status(301).json({ error: "Missing type" });
				}
			}
		}

		songs = songs.slice(
			limit * page,
			Math.min(songs.length, limit * (page + 1))
		);

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
			console.log(`[Artisticly] - Song with ID "${id}" does not exist.`);
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

// not recommended to use yet
app.get("/lyrics/:id", (req, res) => {
	const { id } = req.params;
	// let includesHidden = isCorrectCode(req);

	if (fs.existsSync("./lyrics")) {
		var lyrics = fs.readdirSync("./lyrics");
		let lyric = lyrics.filter((el) => {
			return el.startsWith(`${id}`) && el.endsWith("json");
		})[0];

		if (!lyric) {
			console.log(`[Artisticly] - Lyrics with ID "${id}" don't exist.`);
			return res
				.status(301)
				.json([]);
		}

		return res.status(200).sendFile(`${__dirname}/lyrics/${lyric}`);
	} else {
		console.log(`[Artisticly] - Lyrics folder doesn't exist.`);
		return res.status(301).json({ error: "Lyrics folder doesn't exist." });
	}
});

app.delete("/music/:id", (req, res) => {
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
			console.log(`[Artisticly] - Song with ID "${id}" does not exist.`);
			return res
				.status(301)
				.json({ error: "Song is missing or does not exists" });
		}

		let filePath = `${__dirname}/songs/${song}`;
		fs.rm(filePath, function () {
			return res.status(200).json({ success: true });
		});
	} else {
		console.log(`[Artisticly] - Song with ID "${id}" does not exist.`);
		return res
			.status(301)
			.json({ error: "Song is missing or does not exists" });
	}
});

//TODO: Move songs (switch IDs)

app.post("/spotify/track", async (req, res) => {
	let { link } = req.query;

	if (isCorrectCode(req)) {
		let api = new spotify.api();
		let dl = new spotify.downloader();

		let id = api.getIdFromLink(link, "track");
		let filename = await dl.downloadTrack(id);

		return res.status(200).json({ success: true, newFile: filename });
	} else {
		return res.status(301).json({ error: "Code is incorrect" });
	}
});

app.post("/spotify/album", async (req, res) => {
	let { link } = req.query;

	if (isCorrectCode(req)) {
		let api = new spotify.api();
		let dl = new spotify.downloader();

		let id = api.getIdFromLink(link, "album");
		let filenames = await dl.downloadAlbum(id);

		return res.status(200).json({ success: true, newFiles: filenames });
	} else {
		return res.status(301).json({ error: "Code is incorrect" });
	}
});

app.get("/code", (req, res) => {
	let correct = isCorrectCode(req, true);
	return res.status(correct ? 200 : 301).send({ correct });
});

/**
 * Searches through an array of songs
 * @param {{ id: number, metadata: { name: string, artist: string, album: string, artwork: string }}[]} songs
 * @param {string} query The content to search
 * @param {"title"|"artist"|"album"} searchType The serach filter
 * @returns {{ id: number, metadata: { name: string, artist: string, album: string, artwork: string }}[]} An array of songs corresponding to the query and search filter
 */
function searchSong(songs, query, searchType) {
	let isTitle = searchType == "title";
	let isArtist = searchType == "artist";
	let isAlbum = searchType == "album";

	/**@type {{ id: number, searched: string }[]} */
	let found = songs.map((el) => {
		var searched = "";
		if (isTitle) {
			searched = el.metadata.name;
		} else if (isArtist) {
			searched = el.metadata.artist;
		} else if (isAlbum) {
			searched = el.metadata.album;
		}

		return { id: el.id, searched };
	});
	let filtered = found.filter((el) => {
		let l = el.searched.toLowerCase();
		return l.includes(query.toLowerCase());
	});
	let mapped = filtered.map((el) => {
		return el.id;
	});
	let results = songs.filter((el) => {
		return mapped.includes(el.id);
	});

	return results;
}

/**
 * Checks if the code received from a client is the one chosen by the server admin
 * @param {Request} request The request received from a client
 * @returns {Boolean} Returns `true`, if the code matches
 */
function isCorrectCode(request, slowsDown = false) {
	let sentCode = request.get("Authorization");
	let matches = sentCode == accessCode;

	if (slowsDown && !matches) {
		setTimeout(() => {
			return matches;
		}, 1.75 * 1000);
	} else {
		return matches;
	}
}

/**
 * The function `isLatestVersion` checks if the current server version matches the latest version
 * available using the [GitHub repository](https://github.com/lumaa-dev/ArtisticlyServer).
 * @returns {Promise<Boolean>} If set to true, the current version is the latest available.
 */
async function isLatestVersion() {
	const releases = await fetch(`${serverUpdater}`).then(
		async (res) => await res.json()
	);
	let latestVersion = releases[0]["tag_name"];

	return latestVersion == version.server;
}

if (configured) {
	forceStart();
} else {
	console.log("[Artisticly] - You have not updated your server's settings.");
}

//TODO: Fix bug with album: https://open.spotify.com/album/74wV2lmFaeLdSny2CU7EQw?si=rCgsuaqQSvyzQxD-Hizj1Q
