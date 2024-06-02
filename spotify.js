const fetch = require("node-fetch");
const sdl = require("@nechlophomeriaa/spotifydl");
const fs = require("fs");
const { Readable } = require("stream");
const { write: writeMetadata, setFfmpegPath } = require("ffmetadata");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const audioContext = new (require("web-audio-api").AudioContext)();

/**
 * Spotify Developer documentation: https://developer.spotify.com/documentation/web-api
 */
class SpotifyAPI {
	constructor(clientId, clientSecret) {
		if (typeof clientId == "string" && typeof clientSecret == "string") {
			this.clientId = clientId;
			this.clientSecret = clientSecret;
			this.accessToken = null;
		}
	}

	/**
	 * Get a Spotify access token
	 * @returns {Promise<{"access_token": string,"token_type": string,"expires_in": number}>} A temporary Spotify access token
	 */
	async getToken() {
		const url = "https://accounts.spotify.com/api/token";
		const params = new URLSearchParams();
		params.append("grant_type", "client_credentials");
		params.append("client_id", this.clientId);
		params.append("client_secret", this.clientSecret);

		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: params,
		});

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		/**@type {{"access_token": string,"token_type": string,"expires_in": number}} */
		const data = await response.json();
		this.accessToken = `${data.token_type} ${data.access_token}`;
		return data;
	}

	/**
	 * Get data of a Spotify album
	 * @param {string} link A link to a Spotify album
	 * @param {"album"|"track"} type Type of Spotify content to fetch
	 * @returns {string?} The [Spotify ID](https://developer.spotify.com/documentation/web-api/concepts/spotify-uris-ids) of the link
	 */
	getIdFromLink(link, type = "album") {
		let linkFormat = `${openSpotifyLink(type)}/`;
		if (link.startsWith(linkFormat)) {
			let albumId = link.replace(linkFormat, "");
			return albumId;
		}
		return null;
	}

	/**
	 * Get all the tracks of a Spotify album
	 * @param {string} id The album's [Spotify ID](https://developer.spotify.com/documentation/web-api/concepts/spotify-uris-ids)
	 * @returns {Promise<object>} [Album Tracks](https://developer.spotify.com/documentation/web-api/reference/get-an-albums-tracks)
	 */
	async getAlbumTracks(id) {
		const url = `https://api.spotify.com/v1/albums/${id}/tracks`;
		const params = new URLSearchParams();
		params.append("limit", 50);
		params.append("offset", 0);
		params.append("market", "US");

		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Authorization: this.accessToken,
			},
			body: params,
		});

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const data = await response.json();
		return data;
	}
}

class SpotifyDL {
	constructor() {
		setFfmpegPath(ffmpegPath);
		ffmpeg.setFfmpegPath(ffmpegPath);
	}

	async downloadTrack(id) {
		let url = `${openSpotifyLink("track")}/${id}`;

		/**@type {string} */
		var newFile = "";

		await sdl.downloadTrack(url).then(async (data) => {
			const spotifyMetadata = data;
			let coverUrl = spotifyMetadata["imageUrl"];
			let albumName = spotifyMetadata["album"]["name"];
			await downloadImage(coverUrl, `lastCover.png`);

			setFfmpegPath(ffmpegPath);
			ffmpeg.setFfmpegPath(ffmpegPath);

			let buffer = data.audioBuffer;

			let filename = writeAudio(buffer, false, (path) => {
				let metadata = {
					title: spotifyMetadata["title"],
					artist: spotifyMetadata["artists"],
					album: albumName,
				};
				let art = {
					attachments: [`lastCover.png`],
				};

				console.log(path);

				writeMetadata(path, metadata, art, function (err) {
					if (err) console.error("Error writing metadata: " + err);
					else console.log("Metadata added");
				});

				return filename;
			});

			newFile = filename;
		});

		return newFile;
	}

	async downloadAlbum(id) {
		let url = `${openSpotifyLink("album")}/${id}`;

		/**@type {string[]} */
		var newFiles = [];

		await sdl.downloadAlbum(url).then(async (data) => {
			let coverUrl = data.metadata["cover"];
			let albumName = data.metadata["title"];
			await downloadImage(coverUrl, `lastCover.png`);

			setFfmpegPath(ffmpegPath);
			ffmpeg.setFfmpegPath(ffmpegPath);

			for (let i = 0; i < data.trackList.length; i++) {
				/**
				 * @type {{success: bool, metadata: [Object], audioBuffer: Buffer}}
				 */
				const track = data.trackList[i];
				let buffer = track.audioBuffer;

				let filename = writeAudioIndex(buffer, false, i + 1, (path) => {
					const spotifyMetadata = track.metadata;
					let metadata = {
						title: spotifyMetadata["title"],
						artist: spotifyMetadata["artists"],
						album: albumName,
					};
					let art = {
						attachments: [`lastCover.png`],
					};

					console.log(path);

					writeMetadata(path, metadata, art, function (err) {
						if (err) console.error("Error writing metadata: " + err);
						else console.log("Metadata added");
					});

					return filename;
				});

				newFiles.push(filename);
			}
		});

		return newFiles;
	}
}

function openSpotifyLink(type = "album") {
	return `https://open.spotify.com/${type}`;
}

/**
 * The function `convertAudioBufferToWav` converts an audio buffer to WAV format and writes it to a
 * file.
 * @param {Buffer} audioBuffer - The `audioBuffer` parameter in the `convertAudioBufferToWav` function is an
 * AudioBuffer object that represents a short audio segment in memory. It typically contains audio data
 * in a specific format (e.g., PCM) with a certain sample rate and number of channels. You can create
 * an
 * @param {string} outputFilePath - The `outputFilePath` parameter in the `convertAudioBufferToWav` function is
 * the file path where the WAV audio file will be saved after conversion. It should be a string that
 * specifies the location and name of the output file, including the file extension ".wav". For
 * example, it could
 * @deprecated Use `convertAudioBufferToMp3` for Spotify audio files
 */
async function convertAudioBufferToWav(audioBuffer, outputFilePath) {
	const sampleRate = audioBuffer.sampleRate;
	const numberOfChannels = audioBuffer.numberOfChannels;

	// Create an array to hold the channel data
	const channelData = [];
	for (let i = 0; i < numberOfChannels; i++) {
		channelData.push(audioBuffer.getChannelData(i));
	}

	// Create a WAV audio buffer object
	const wavBuffer = {
		sampleRate: sampleRate,
		channelData: channelData,
	};

	// Encode the audio data to WAV format
	const buffer = await wavEncoder.encode(wavBuffer);

	// Write the buffer to a file
	fs.writeFileSync(outputFilePath, Buffer.from(buffer));
}

/**
 * The function `convertAudioBufferToMp3` takes an audio buffer, interleaves the channel data, encodes
 * it to MP3 format, and writes it to an output file.
 * @param {Buffer} audioBuffer - The `audioBuffer` parameter in the `convertAudioBufferToMp3` function is an
 * AudioBuffer object that represents a buffer containing audio data. It typically contains audio
 * samples for one or more channels at a specific sample rate. You can create an AudioBuffer using the
 * Web Audio API or other audio
 * @param {string} outputFilePath - The `outputFilePath` parameter in the `convertAudioBufferToMp3` function is
 * the file path where the MP3 file will be saved after encoding. It should be a string that specifies
 * the location and name of the output MP3 file. For example, it could be something like `'path
 * @returns The `convertAudioBufferToMp3` function returns a Promise.
 */
async function convertAudioBufferToMp3(audioBuffer, outputFilePath) {
	const sampleRate = audioBuffer.sampleRate;
	const numberOfChannels = audioBuffer.numberOfChannels;

	// Create an array to hold the interleaved PCM data
	const length = audioBuffer.length * numberOfChannels;
	const interleavedData = new Float32Array(length);

	// Interleave the channel data
	for (let i = 0; i < audioBuffer.length; i++) {
		for (let channel = 0; channel < numberOfChannels; channel++) {
			interleavedData[i * numberOfChannels + channel] =
				audioBuffer.getChannelData(channel)[i];
		}
	}

	// Convert interleaved Float32Array to Int16Array
	const int16Data = new Int16Array(interleavedData.length);
	for (let i = 0; i < interleavedData.length; i++) {
		int16Data[i] = Math.max(-1, Math.min(1, interleavedData[i])) * 32767; // Convert to 16-bit PCM
	}

	// Create a buffer from the Int16Array
	const buffer = Buffer.from(int16Data.buffer);

	// Create a readable stream from the buffer
	const readableStream = new Readable();
	readableStream.push(buffer);
	readableStream.push(null); // Indicates the end of the stream

	// Create the FFmpeg command
	const command = ffmpeg();

	// Set input as a readable stream
	command
		.input(readableStream)
		.inputFormat("s16le")
		.audioFrequency(sampleRate)
		.audioChannels(numberOfChannels);

	// Set output format and options
	command
		.output(outputFilePath)
		.audioBitrate("128k")
		.audioCodec("libmp3lame")
		.audioFilter("asetrate=44100*2.19008264463"); // Adjust the atempo filter value to match the difference in duration;

	// Execute the command
	return new Promise((resolve, reject) => {
		command
			.on("end", () => {
				console.log("MP3 encoding complete.");
				resolve();
			})
			.on("error", (err) => {
				console.error("Error encoding MP3:", err);
				reject(err);
			})
			.run();
	});
}

/**
 * The function `writeAudio` writes an audio buffer to a WAV file in a "songs" folder, with an option
 * to hide the file.
 * @param {Buffer} buffer - The `buffer` parameter in the `writeAudio` function is expected to be an audio
 * buffer containing the audio data that needs to be written to a WAV file. This buffer will be decoded
 * using the `audioContext.decodeAudioData` method to obtain the audio data, which will then be
 * converted to a `.wav` file
 * @param {boolean} [hidden=false] - The `hidden` parameter in the `writeAudio` function is a boolean flag that
 * determines whether the audio file should be hidden or not. If `hidden` is set to `true`, the
 * file name of the audio file will include a `0` before the `spotifydl.wav` extension.
 * @param {(string) => void} onCreation - When it succeeds on creation the `.wav` file, it will execute the `onCreation` function with the file path
 * as its parameter
 * @returns {string?} The function `writeAudio` is returning the file name of the `.wav` file as well as a success message "WAV file has been created
 * successfully!" if the WAV file creation is successful, or an error message "Error:" followed by the
 * specific error if there is an error during the process.
 */
function writeAudio(buffer, hidden = false, onCreation) {
	return writeAudioIndex(buffer, hidden, 1, onCreation);
}

/**
 * The function `writeAudioIndex` writes an audio buffer to a WAV file in a "songs" folder, with an option
 * to hide the file and an index.
 * @param {Buffer} buffer - The `buffer` parameter in the `writeAudio` function is expected to be an audio
 * buffer containing the audio data that needs to be written to a WAV file. This buffer will be decoded
 * using the `audioContext.decodeAudioData` method to obtain the audio data, which will then be
 * converted to a `.wav` file
 * @param {boolean} [hidden=false] - The `hidden` parameter in the `writeAudio` function is a boolean flag that
 * determines whether the audio file should be hidden or not. If `hidden` is set to `true`, the
 * file name of the audio file will include a `0` before the `spotifydl.wav` extension.
 * @param {(string) => void} onCreation - When it succeeds on creation the `.wav` file, it will execute the `onCreation` function with the file path
 * as its parameter
 * @returns {string?} The function `writeAudioIndex` is returning the file name of the `.wav` file as well as a success message "WAV file has been created
 * successfully!" if the WAV file creation is successful, or an error message "Error:" followed by the
 * specific error if there is an error during the process.
 */
function writeAudioIndex(buffer, hidden = false, i = 1, onCreation) {
	if (!fs.existsSync("./songs")) {
		console.log(
			'[Artisticly] - Please create a "songs" folder in the root directory.'
		);
		return;
	}
	var songs = fs.readdirSync("./songs");
	songs = songs.filter((el) => {
		return el.endsWith("mp3") || el.endsWith("wav") || el.endsWith("m4a");
	});

	let ids = songs.map((el) => {
		return el.split(/-+/g)[0];
	});
	var newId = -1

	let missings = findMissing(ids)
	if (missings.length > 0) {
		newId = missings[0];
	} else {
		newId = ids.length + i;
	}

	let = filename = `${newId}-${hidden ? 0 : 1}-spotifydl.mp3`;

	audioContext.decodeAudioData(buffer, (audioBuffer) => {
		convertAudioBufferToMp3(audioBuffer, `./songs/${filename}`)
			.then(() => {
				console.log("MP3 file has been created successfully!");
				onCreation(`./songs/${filename}`);
			})
			.catch((error) => console.error("Error:", error));
	});

	return filename;
}

async function downloadImage(url, imagePath) {
	const response = await fetch(url);

	if (!response.ok) {
		throw new Error(`HTTP error! status: ${response.status}`);
	}

	const writer = fs.createWriteStream(imagePath);

	return new Promise((resolve, reject) => {
		response.body.pipe(writer);
		let error = null;
		writer.on("error", (err) => {
			error = err;
			writer.close();
			reject(err);
		});
		writer.on("close", () => {
			if (!error) {
				resolve(true);
			}
		});
	});
}

/**
 * Find the missing number(s) of an array of integers
 * @param {string[]} listIndexes The array of integers
 * @returns {number[]} Returns the missing indexes sorted by smallest to biggest
 */
function findMissing(listIndexes = []) {
	var missing = [];
	console.log(listIndexes);
	for (let i = 1; i < listIndexes.length; i++) {
		if (!listIndexes.includes(`${i}`)) {
			console.log(`index ${i} added`);
			missing.push(i);
		}
	}

	missing.sort((a, b) => a - b);
	return missing
}

module.exports.api = SpotifyAPI;
module.exports.downloader = SpotifyDL;
