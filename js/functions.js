/*
OpenRailwayMap Copyright (C) 2012 Alexander Matheisen
This program comes with ABSOLUTELY NO WARRANTY.
This is free software, and you are welcome to redistribute it under certain conditions.
See https://wiki.openstreetmap.org/wiki/OpenRailwayMap for details.
*/

// returns the lang-region-code that fits the best to the user
function getUserLang()
{
	// override browser settings when language is set in url
	if (params['availableTranslations'].hasOwnProperty(params['lang']))
		return params['availableTranslations'][params['lang']][0];

	var lang = navigator.language || navigator.userLanguage || 'en-GB';
	var languages = navigator.languages || [lang];

	for (var i = 0; i < languages.length; i++)
	{
		// lang-country combination as first choice
		var langcountrycode = languages[i].replace('-', '_');
		for (var key in params['availableTranslations']) {
			if (params['availableTranslations'].hasOwnProperty(key) && params['availableTranslations'][key][0] === langcountrycode)
				return langcountrycode;
		}

		// only lang as second choice
		var langcode = langcountrycode.split('_')[0];
		if (params['availableTranslations'].hasOwnProperty(langcode))
			return params['availableTranslations'][langcode][0];
	}

	return 'en_GB';
}


// reload the legend after changing zoomlevel or stylesheet
function updateLegend(id, style)
{
	gEBI(id).src = window.openrailwaymap.root + 'legend-generator.php?zoom=' + map.getZoom() + '&style=' + style + '&lang=' + params['lang'] + '&bounds=' + map.getBounds().toBBoxString();
}

// draws the legend entries on canvas
function drawLegendIcons(zoom, st, bbox) {
	MapCSS.preloadSpriteImage(st, '../styles/' + st + '.png');
	var style = { styles: [st] };
	var table = gEBI('legend-table');
	var bounds = bbox ? JSON.parse('[' + bbox + ']') : [];

	window.openrailwaymap = {
		'root': params['urlbase']
	};

	var handler = function(request)
	{
		getRequest(window.openrailwaymap.root + "locales/" + getUserLang() + "/LC_MESSAGES/messages.json", function(langresponse)
		{
			window.openrailwaymap.translations = JSON.parse(langresponse);
			var div = gEBI('legend-container');

			var response = request.status === 200 ? request.responseText : '';
			if (!response || response.length <= 0 || response == "NULL") {
				var p = document.createElement('p');
				p.appendChild(document.createTextNode('Legend not available for this style.'));
				div.appendChild(p);
				setIframeElementHeight(window.frameElement);
				return;
			}

			var data = JSON.parse(response);
			var table = document.createElement('table');

			var writeLine = function(lineheight, caption, features)
			{
				var tr = document.createElement('tr');
				var td0 = document.createElement('td');
				var td1 = document.createElement('td');

				var canvas = document.createElement('canvas');
				canvas.width = 80;
				canvas.height = lineheight;
				td0.appendChild(canvas);
				tr.appendChild(td0);
				var caption = document.createTextNode(caption);
				td1.appendChild(caption);
				tr.appendChild(td1);

				table.appendChild(tr);

				var obj = {};
				obj.features = features;
				obj.granularity = 100;
				Kothic.render(canvas, obj, zoom, style);
			}

			// create intersection list for all given boxes
			var matched_boxes = [];
			if (bounds) {
				var mapbounds = L.latLngBounds(L.latLng(bounds[0], bounds[1]), L.latLng(bounds[2], bounds[3]));
				for (var key in data.bboxes) {
					if (!data.bboxes.hasOwnProperty(key))
						continue;

					var fbox = data.bboxes[key];
					if (Array.isArray(fbox) && fbox.length === 4) {
						var fbounds = L.latLngBounds(L.latLng(fbox[0], fbox[1]), L.latLng(fbox[2], fbox[3]));
						if (fbounds && mapbounds.intersects(fbounds))
							matched_boxes.push(key);
					}
				}
			}

			for (var i = 0; i < data.mapfeatures.length; i++) {
				var feature = data.mapfeatures[i];

				if (feature.minzoom && feature.minzoom > zoom)
					continue;
				if (feature.maxzoom && feature.maxzoom < zoom)
					continue;

				var fboxes = feature.bbox;
				if (fboxes && fboxes.length >= 0) {
					// if feature has a non-empty bbox, check if is in the list of those that
					// intersect the currently visible area
					var inbounds = false;
					for (var j = 0; (j < fboxes.length) && !inbounds; j++) {
						inbounds = (matched_boxes.findIndex(function(element) {
									return element === fboxes[j];
								}) >= 0);
					}
					if (!inbounds)
						continue;
				}

				var lh = feature.lineheight || 16;

				if (feature.heading) {
					var tr = document.createElement('tr');
					var td0 = document.createElement('td');
					td0.colspan = 2;
					td0.className = 'section';
					var caption = document.createTextNode(_(feature.heading));
					td0.appendChild(caption);
					tr.appendChild(td0);
					table.appendChild(tr);
				} else if (feature.replace) {
					var k, m, n, cp, fe;
					for (var j = 0; j < feature.replace.length; j++) {
						cp = _(feature.caption);
						// replace caption here instead of doing it below as that
						// would try to do the same replacement for every entry in
						// features again.
						for (k in feature.replace[j]) {
							cp = cp.replace(k, feature.replace[j][k]);
						}
						// sadly one can't just copy feature.features here as that would be just a
						// reference to the original object, so the original would be modified, too
						fe = [];
						for (m = 0; m < feature.features.length; m++) {
							fe[m] = {};
							fe[m].type = feature.features[m].type;
							fe[m].coordinates = feature.features[m].coordinates;
							// again, no deep copy
							fe[m].properties = {};
							for (n in feature.features[m].properties) {
								fe[m].properties[n] = feature.features[m].properties[n];
								for (k in feature.replace[j]) {
									fe[m].properties[n] = fe[m].properties[n].replace(k, feature.replace[j][k]);
								}
							}
						}
						writeLine(lh, cp, fe);
					}
				} else {
					writeLine(lh, _(feature.caption), feature.features);
				}
			}

			if (table.firstChild) {
				div.appendChild(table);
			} else {
				table.remove();
				var p = document.createElement('p');
				p.appendChild(document.createTextNode('Nothing to see in this zoom level. Please zoom in.'));
				div.appendChild(p);
			}

			setIframeElementHeight(window.frameElement);
		});
	}

	var request = new XMLHttpRequest();

	request.open("GET", window.openrailwaymap.root + 'styles/' + st + '.json', true);
	request.onreadystatechange = function()
	{
		if (request.readyState === 4)
			handler(request);
	};
	request.send(null);

}

// renews the permalink url after zooming, changing style or dragging the map
function updatePermalink(style)
{
	gEBI('permalinkButton').href = getPermalinkUrl(style);
	if (gEBI("desktopButton") != null)
		gEBI('desktopButton').href = (getPermalinkUrl(style).replace("mobile.php", "index.php"))+"&mobile=0";
}


// shorter than document.get... everywhere
function gEBI(id)
{
	return document.getElementById(id);
}


// prevent josm remote plugin of showing message
function josm(url)
{
	var josmFrame = gEBI("josmFrame");
	if (josmFrame)
	{
		josmFrame.src = url;
		return false;
	}
	return true;
}


// perform an async GET request
function getRequest(url, handler)
{
	var request = new XMLHttpRequest();

	request.open("GET", url, true);

	request.onload = function()
	{
		if (request.status >= 200 && request.status < 400)
		{
			handler(request.responseText);
		}
		else
		{
			handler(false);
		}
	};

	request.onerror = function()
	{
		console.log('Error: ' + request.status);
		handler(false);
	};

	request.send();
}


// perform an async API request
function requestAPI(request, params, handler)
{
	if (params)
		getRequest(window.openrailwaymap.apiUrl + request + '?' + params.replace(/ /g, '+'), handler);
	else
		getRequest(window.openrailwaymap.apiUrl + request, handler);
}


// updates map's center
function updateMap()
{
	map.setView(map.getCenter(), map.getZoom());
}


// reloads the page in a different language
function changeLanguage(lang)
{
	window.location = getPermalinkUrl(railmap.selectedStyle, lang);
}


// returns a permalink storing all current settings (language, position, zoom, url params); style parameter is necessary, lang parameter is not necessary
function getPermalinkUrl(style, lang)
{
	var url = window.location.origin + window.location.pathname;

	url += '?style='+style;

	if (lang === null || lang === undefined) {
		lang = params['lang'];
	}
	if (lang !== null) {
		url += '&lang='+lang;
	}

	if (params['id'] != null)
		url += '&id='+params['id'];

	if (params['type'] != null)
		url += '&type='+params['type'];

	var position = map.getCenter();
	url += '&lat='+position.lat;
	url += '&lon='+position.lng;
	url += '&zoom='+map.getZoom();

	if (params['offset'] != null)
		url += '&offset='+params['offset'];

	if (params['searchquery'] != "")
		url += '&q='+params['searchquery'];

	if (params['ref'] != null)
		url += '&ref='+params['ref'];

	if (params['name'] != null)
		url += '&name='+params['name'];

	if (params['position'] != null)
		url += '&position='+params['position'];

	if (params['line'] != null)
		url += '&line='+params['line'];

	return url;
}


// builds a lat-lon url parameter
function queryLatLon(lat, lon)
{
	return "lat="+lat+"&lon="+lon;
}


// builds a lat-lon url parameter with zoom
function queryLatLonZoom(lat, lon, zoom)
{
	return queryLatLon(lat, lon)+"&zoom="+zoom;
}

// resize the height of a given iframe to the height of the content
function setIframeElementHeight(legend)
{
	var doc = legend.contentDocument ? legend.contentDocument : legend.contentWindow.document;
	legend.style.visibility = 'hidden';
	legend.style.height = "10px";
	var body = doc.body;
	var html = doc.documentElement;
	legend.style.height = Math.max(body.scrollHeight, body.offsetHeight, html.clientHeight, html.scrollHeight, html.offsetHeight)+4+"px";
	legend.style.visibility = 'visible';
}

// resize the height of an iframe with a given id to the height of the content
function setIframeHeight(id)
{
	setIframeElementHeight(gEBI(id));
}

// check whether the visitor uses a mobile device or not
function isMobileDevice()
{
	if (navigator.userAgent.match(/Android/i)
		|| navigator.userAgent.match(/webOS/i)
		|| navigator.userAgent.match(/iPhone/i)
		|| navigator.userAgent.match(/iPad/i)
		|| navigator.userAgent.match(/iPod/i)
		|| navigator.userAgent.match(/BlackBerry/i)
		|| navigator.userAgent.match(/Windows Phone/i)
		|| navigator.userAgent.match(/Jolla/)
	)
		return true;

	if (window.innerWidth <= 800 && window.innerHeight <= 600)
		return true;

	return false;
}

// redirect to mobile website if necessary
function mobileRedirection()
{
	if (params['mobile'] || isMobileDevice() && params['mobile'] == null)
	{
		var paramlist = "";

		for (var param in params)
			if (param == 'urlbase')
				continue;
			else if (params[param])
				paramlist += "&"+param+"="+params[param];

		document.location.href = params.urlbase + "mobile.php?" + paramlist.substr(1);
	}
}

// create layer and zoom controls
function setupControls()
{
	// grayscale mapnik background layer
	var mapnikGray = new L.TileLayer.Grayscale('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
	{
		attribution: _("Map data &copy; OpenStreetMap contributors"),
		maxZoom: 19
	}).addTo(map);
	// normal mapnik background layer
	var mapnik = new L.TileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
	{
		attribution: _("Map data &copy; OpenStreetMap contributors"),
		maxZoom: 19
	});

	// blank background map
	var blank = new L.TileLayer(window.openrailwaymap.root+'/img/blank.png',
	{
		maxZoom: 20
	});

	var baseLayers = new Object();
	baseLayers[_("Mapnik")] = mapnik;
	baseLayers[_("Mapnik Grayscale")] = mapnikGray;
	baseLayers[_("No background map")] = blank;

	// hillshading layer
	var hillshading = new L.TileLayer('http://{s}.tiles.wmflabs.org/hillshading/{z}/{x}/{y}.png',
	{
		attribution: _("Hillshading by <a href='https://www.nasa.gov/'>NASA SRTM</a>"),
		maxZoom: 17
	});

	var overlays = new Object();
	overlays[_("Hillshading")] = hillshading;
	overlays[_("OpenRailwayMap")] = railmap;

	new L.Control.Scale({metric:true, maxWidth:200}).addTo(map);
	new L.Control.Layers(baseLayers, overlays).addTo(map);
}

function _(sourcemsg, n)
{
	if (typeof window.openrailwaymap.translations[sourcemsg] === 'undefined')
		return sourcemsg;

	if (n === undefined)
		return window.openrailwaymap.translations[sourcemsg][1];

	var pluralForms = window.openrailwaymap.translations[""]["Plural-Forms"].match(/plural=(.*);/)[1];
	var pluralIndex = eval(pluralForms.replace(/n/), n) + 1;
	return window.openrailwaymap.translations[sourcemsg][pluralIndex].replace(/%d/, n);
}

function escapeForHTML(raw)
{
	return raw.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}
