window.mode = "Trollbox";
var users = {};
window.pool = null;
window.version = 2;
window.hasFinishedLoading = false;
var pubKey;
var snd = new Audio("/pop.mp3");
window.lastDrawMode = null;

var showSearchIcon = true;
function toggleSearchBox() {
  if (showSearchIcon) {
    document.querySelector('#search-container #xmark').style.display = 'none';
    document.querySelector('#search-container #search-wrapper').style.display = 'none';
    document.querySelector('#search-container #search').style.display = 'inline-block';
    document.querySelectorAll('#topbar nav .right > a').forEach(i => i.style.display = 'inline-block');
    showSearchIcon = false;
  } else {
    document.querySelector('#search-container #xmark').style.display = 'inline-block';
    document.querySelector('#search-container #search-wrapper').style.display = 'inline-block';
    document.querySelector('#search-container #search').style.display = 'none';
    document.querySelectorAll('#topbar nav .right > a').forEach(i => i.style.display = 'none');
    showSearchIcon = true;
  }
}

toggleSearchBox();

config = {
  locateFile: filename => `${filename}`
}

function setExtensionIcon(tab, currentURL) {
  const u = new URL(currentURL);
  var domain = u.hostname.toLowerCase();

  const stmt = window.db.prepare("SELECT * FROM toasts WHERE domain = $domain");
  stmt.bind({$domain: domain});

  var rows = [];
  // Bind new values
  while(stmt.step()) {
    const row = stmt.getAsObject();
    rows.push(JSON.stringify(row));
  }

  console.log("Setting Extension! @ " + currentURL);
  if(rows.length > 0) {
    console.log("Toasting Icon");
    browser.browserAction.setIcon({
      path: {
        '16': "icons/red-16.png",
        '32': "icons/red-32.png",
        '64': "icons/red-64.png",
    }, tabId: tab.id});
  } else {
    console.log("Untoasting Icon");
    browser.browserAction.setIcon({
      path: {
        '16': "icons/logo-16.png",
        '32': "icons/logo-32.png",
        '64': "icons/logo-64.png",
    }, tabId: tab.id});
  }
}

function toBinArray(str) {
  var l = str.length,
    arr = new Uint8Array(l);
  for (var i = 0; i < l; i++) arr[i] = str.charCodeAt(i);
  return arr;
}

function toBinString(arr) {
  var uarr = new Uint8Array(arr);
  var strings = [], chunksize = 0xffff;
  // There is a maximum stack size. We cannot call String.fromCharCode with as many arguments as we want
  for (var i = 0; i * chunksize < uarr.length; i++) {
    strings.push(String.fromCharCode.apply(null, uarr.subarray(i * chunksize, (i + 1) * chunksize)));
  }
  return strings.join('');
}

function getRelays() {
  var default_relays = ["wss://relay.toastr.net", "wss://purplepag.es", "wss://relay.damus.io", "wss://nos.lol", "wss://relay.primal.net"];
  var relays = [];
  var override_relays = true;

  if (override_relays) {
    var relays = ["wss://toastr.tylerfreedman.com", "wss://purplepag.es"];
    document.querySelector('#settings #relays .message').innerHTML = 'Overriding NIP-07 Relays for debugging purposes';
  } else {
    if (typeof window.nostr !== 'undefined') {
      // Detected NIP-07 support
      document.querySelector('#settings #relays .message').innerHTML = 'Retrieving relays via NIP-07';
      window.nostr.getRelays().then(r => {
        for (const [key, value] of Object.entries(r)) {
          relays.push(key);
        }
        displayRelays(relays);
      })
    } else {
      relays = relays.concat(default_relays);
    }
  }
  displayRelays(relays);
  return relays;
}

function displayRelays(relays) {
  const div = document.createElement('div');
  relays.forEach((relay) => {
    div.innerHTML += `
      <div class="field">
        <label for="relay[]">Relay</label>
        <input class="input relay" name="relay[]" disabled value="${relay}" type="text" />
      </div>
    `
  });

  document.querySelector('#settings .relays').innerHTML = div.innerHTML;
}

function displayProfile(pubKey) {
  if (pubKey !== undefined) {
    window.pubKey = pubKey;
    document.querySelector('#keys input[name="pubkey"]').value = pubKey;
    document.querySelector('#keys input[name="pubkey"]').disabled = true;
    document.querySelector('#keys input[name="npub"]').value = window.NostrTools.nip19.npubEncode(pubKey);
    document.querySelector('#keys input[name="npub"]').disabled = true;

    document.querySelector('#keys button').addEventListener('click', updateProfile);
    document.querySelector('#profile button').addEventListener('click', updateProfile);

    if (window.users[pubKey] !== undefined) {
      console.log("There's profile data!");
      var profile = JSON.parse(window.users[pubKey].content);
      if (profile.name !== undefined) {
        document.querySelector('#profile input[name="name"]').value = profile.name;
      }
      if (profile.displayName !== undefined) {
        document.querySelector('#profile input[name="display_name"]').value = profile.displayName;
      }
      if (profile.website !== undefined) {
        document.querySelector('#profile input[name="website"]').value = profile.website;
      }
      if (profile.banner !== undefined) {
        document.querySelector('#profile input[name="banner"]').value = profile.banner;
      }
      if (profile.picture !== undefined) {
        document.querySelector('#profile input[name="picture"]').value = profile.picture;
      }
      console.log(users[pubKey]);
    } else {
      console.log("No profile data :(");
    }
  }
}

function getReplyAuthor(elem) {
  do elem = elem.previousElementSibling;
  while (!elem.classList.contains("author"));
  return {username: elem.querySelector(".username").textContent, pubkey: elem.querySelector(".pubkey").textContent, avatar: elem.querySelector(".avatar").innerHTML};
}

function updateProfile() {
  var content = {};
  var container = document.querySelector('#profile');
  var name = container.querySelector('input[name="name"]').value;
  var displayName = container.querySelector('input[name="display_name"]').value;
  var website = container.querySelector('input[name="website"]').value;
  var banner = container.querySelector('input[name="banner"]').value;
  var picture = container.querySelector('input[name="picture"]').value;

  if (name.length > 0) {content.name = name}
  if (displayName.length > 0) {content.displayName = displayName}
  if (website.length > 0) {content.website = website}
  if (banner.length > 0) {content.banner = banner}
  if (picture.length > 0) {content.picture = picture}

  var e = {
    created_at: Math.floor(Date.now() / 1000),
    kind: 0,
    tags: [],
    content: JSON.stringify(content)
  }

  if (typeof window.nostr !== 'undefined') {
    // NIP07 supported
    window.nostr.signEvent(e).then(event => {
      console.log("signed event via nip07: " + event);
      uploadProfileEvent(event);
    })
  } else {
  // NIP07 unsupported
    var event = window.NostrTools.finalizeEvent(e, Uint8Array.from(window.NostrTools.nip19.decode(localStorage.getItem('privkey')).data))
    console.log("signed event without nip07: " + event);
    uploadProfileEvent(event);
  }
}

function uploadProfileEvent(note) {
  console.log("Sending " + JSON.stringify(note));
  Promise.any(window.pool.publish(relays, note)).then(relay => {
    console.log("Uploaded kind 0 event")
  });
}

function validateToast(event) {
  var data = event.target.parentElement;

  if (window.mode == "Toastr") {
    //Do nothing
  } else if (window.mode == "Trollbox") {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (data.checkValidity()) {
        data.requestSubmit();
      }
    } else {
      // Do nothing
    }
  }
}

function validateProfile(event) {
  event.preventDefault();

  var data = event.target.parentElement.parentElement;

  if (data.checkValidity()) {
    data.querySelector('#profile button').disabled = false;
  } else {
    data.querySelector('#profile button').disabled = true;
  }
}


function deleteReplyContent(event) {
  event.originalTarget.parentElement.querySelector('.heading').innerHTML = '';
  event.originalTarget.parentElement.querySelector('.username').innerHTML = '';
  event.originalTarget.parentElement.querySelector('.content').innerHTML = '';
  event.originalTarget.parentElement.querySelector('.tags').innerHTML = '';
  event.originalTarget.parentElement.classList.add('hidden');
}

// This technically handles notes and toasts
function newNoteSubmit(event) {
  event.preventDefault();

  var data = event.target;

  // If you're replying to a note with a global reply box, the tags from the quoted note can be found in the global reply-details div
  // If you're replying to a note with a local reply box,  the tags from the quoted note are already in the local form
  if (event.target.querySelectorAll(".reply-details .tags input[name='e']").length > 0) {
    var e = event.target.querySelectorAll(".reply-details .tags input[name='e']");
  } else {
    var e = event.target.querySelectorAll("input[name='e']");
  }

  if (data.url.value != "") {
    // Root Note
    if (window.mode == "Toastr") { // Root toasts exist for specific URLs
      var e = {created_at: Math.floor(Date.now() / 1000), kind: 1, tags: [['r', data.url.value], ['t', 'toastr'], ['subject', data.title.value]], content: data.title.value};
    } else if (window.mode == "Trollbox") { // Channels can map to domain names, but there's no validations
      var e = {created_at: Math.floor(Date.now() / 1000), kind: 40, tags: [['r', data.url.value], ['t', 'trollbox']], content: JSON.stringify({'name': data.url.value})};
    }
  } else if (e[0] && (e[0].dataset.marker == "reply" || e[0].dataset.marker == "root")) {
    // Reply
    var tags = [];
    e.forEach((el) => {
      tags.push(['e', el.dataset.eventId, el.dataset.relayUrl, el.dataset.marker, el.dataset.pubkey]);
    });
    console.log('tags: ' + tags);
    var e = {created_at: Math.floor(Date.now() / 1000), kind: 42, tags: tags, content: data.message.value};
  }

  if (typeof window.nostr !== 'undefined') {
    // NIP07 supported
    window.nostr.signEvent(e).then(note => {
      console.log("signed note via nip07: " + note);
      uploadNote(data, note, data.parentElement.parentElement.parentElement);
    })
  } else {
  // NIP07 unsupported
    var note = window.NostrTools.finalizeEvent(e, Uint8Array.from(window.NostrTools.nip19.decode(localStorage.getItem('privkey')).data))
    console.log("signed note without nip07: " + note);
    uploadNote(data, note, data.parentElement.parentElement.parentElement);
  }
}

function uploadNote(data, note, parent) {
  window.data = data;
  console.log("Sending " + JSON.stringify(note));
  Promise.any(window.pool.publish(relays, note)).then(relay => {
    // When we upload a note, normally we'd have to keep track of state.
    // If there are no messages, we'd have to remove the message asking you to be the first.
    // We'd also have to update the number of messages, etc. Or, we can cheat and just re-render everything.

    var isToast = false;
    if (window.mode == "Toastr") {
      note["tags"].forEach((tag) => {
        if (tag[0] == "t" && tag[1].toLowerCase().startsWith('toastr')) {
          isToast = true;
        }
      });
    } else if (window.mode == "Trollbox") {
      if (note["kind"] == 40) {
        note["tags"].forEach((tag) => {
          if (tag[0] == "t" && tag[1].toLowerCase().startsWith('trollbox')) {
            isToast = true;
          }
        });
      }
    }

    if (isToast) {
      window.importToast(note, window.hasFinishedLoading);
      document.getElementById('search-bar').value = window.NostrTools.nip19.noteEncode(note["id"]);
      history.pushState({hash: note["id"], title: document.title}, '', '#' + note["id"]);
    } else {
      window.importNote(note, window.hasFinishedLoading); // if the page has finished loading, save the DB in response to any change.
    }

    if (window.mode == "Toastr") {
      searchResults(document.getElementById('search-bar').value);
    } else if (window.mode == "Trollbox") {
      searchResults(document.getElementById('search-bar').value);
      if (!isToast)  {
        window.scrollTo({
          top: document.body.scrollHeight,
          behavior: 'smooth'
        });
      }
    }
    data.reset();
  });
}
//TODO: remove users
function displayToast(parent, data, note, params) {
  const div = document.createElement('div');

  var root = null;
  var hash = null;
  var eTags = [];
  var isReply = false;
  var inReplyTo;
  var marker;
  note["tags"].forEach((tag) => {
    if (tag[0] == "e") {
      eTags.push(tag);
      if (tag[3] && tag[3] == 'root') {
        root = tag[1];
        marker = 'reply'; // If there's a root e tag defined, mark it as a reply instead.
      }
      if (tag[3] && tag[3] == 'reply') {
        inReplyTo = tag[1];
        isReply = true;
      }
    }
  });
  if (note) {
    eTags.push(['e', note.id, '', marker, note.pubkey])
  }

  // When we render a note that happens to be a reply, we embed the context from the referenced note
  // Only the last reply counts - if that note was also a reply, we ignore it.
  if (isReply) {
    stmt = window.db.prepare("SELECT * FROM notes WHERE id = $id");
    stmt.bind({$id: inReplyTo});

    var referencedNote;
    while(true) {
      if (stmt.step()) {
        row = stmt.getAsObject();
        referencedNote = JSON.parse(row.note);
      } else {
        break;
      }
    }
  }


  if (root) {
    hash = window.NostrTools.nip19.noteEncode(root) + "-" + window.NostrTools.nip19.noteEncode(note["id"]);
  } else {
    hash = window.NostrTools.nip19.noteEncode(note["id"])
  }

  div.classList.add('note');

  div.id = hash;

  if (document.getElementById('search-bar').value == hash) {
    div.classList.add('highlight');
  }

  var epoch_timestamp = new Date(0);
  epoch_timestamp.setUTCSeconds(data.created_at);

  var imageClass = '';

  if (data.avatarURL === null) {
    data.avatarURL = hashicon(data.pubkey).toDataURL();
    imageClass = 'hashicon';
  }

  var eTagString = '';
  eTags.forEach(function (tag, index) {
    eTagString += `<input type="hidden" name="e" data-event-id="${tag[1]}" data-relay-url="${tag[2]}" data-marker="${tag[3]}" data-pubkey="${tag[4]}" />`
  })

  // If a note was written by the same user, we can skip displaying their npub / username again - necessary in chat mode
  var showUser = '';
  if (params.lastPubkey == data.pubkey) {
    showUser = 'hidden';
  }

  // If a note was written within a short timespan of the previous note, we can skip displaying the timestamp.
  var showTime = '';
  if (params.lastTimestamp + 1 > data.created_at) {
    showTime = 'opacity: 0';
    showUser = '';
  }

  var lastTimestampDate = new Date(0);
  lastTimestampDate.setUTCSeconds(params.lastTimestamp)

  var epochTimestamp = new Date(0);
  epochTimestamp.setUTCSeconds(data.created_at);

  var date = null;

  if (lastTimestampDate.toDateString() != epochTimestamp.toDateString()) {
    date = document.createElement('div');
    date.classList.add('date');

    var epochTimestamp = new Date(0);
    epochTimestamp.setUTCSeconds(data.created_at);

    date.innerHTML = `
      <div>
        <div class="date">${epochTimestamp.toDateString()}</div>
      </div>
    `
  }

  var author = null;

  if (showUser == '') {
    author = document.createElement('div');
    author.classList.add('author');
    author.innerHTML = `
      <div>
        <div class="avatar">
          <img src="${data.avatarURL}" class="${imageClass}"/>
        </div>
        <div class="content">
          <header>
            <div class="details">
              <span class="username">${data.username}</span>
            </div>
            <div class="pubkey">${window.NostrTools.nip19.npubEncode(data.pubkey)}</div>
          </header>
        </div>
      </div>
    `
  }

  var innerHTML = `
    <div>
      <div class="content">
        <div class="created_at" style="${showTime}"><time datetime="${epoch_timestamp}"><div class="tooltip">${epochTimestamp.toUTCString()}</div>${(epochTimestamp.getHours() < 10 ? '0' : '') + epochTimestamp.getHours()}:${(epochTimestamp.getMinutes() < 10 ? '0' : '') + epochTimestamp.getMinutes()}</time></div>
        <div class="caption">`

      if (isReply && referencedNote !== undefined) {
        var replyUsername = 'Unknown';
        var replyAvatarURL = null;
        var imageClass = '';

        if (params.users[referencedNote.pubkey]) {
          var replyUser = JSON.parse(params.users[referencedNote.pubkey].content);
          if (typeof replyUser.picture !== 'undefined') {
            replyAvatarURL = replyUser.picture;
          }
          if (typeof replyUser.name !== 'undefined') {
            replyUsername = replyUser.name;
          }
        }
        if (replyAvatarURL === null) {
          replyAvatarURL = hashicon(referencedNote.pubkey).toDataURL();
          imageClass = 'hashicon';
        }

        innerHTML += `
          <div class="context">
            <div class="avatar">
              <img src="${replyAvatarURL}" class="${imageClass}"/>
            </div>
            <span class="username">${replyUsername}</span> <span class="pubkey">(${window.NostrTools.nip19.npubEncode(referencedNote.pubkey)})</span><br />${referencedNote.content.replace(/\n/g, '<br />')}
          </div>`
      }

      innerHTML += `
      ${data.message.replace(/\n/g, '<br />')}</div>
        <footer></footer>
        <div class="tags hidden">
          ${eTagString}
        </div>
      </div>
    </div>
  `

  div.innerHTML = innerHTML;

  const permalink = document.createElement('a');
  permalink.innerHTML = '<img src="link.svg" alt="Permalink" />';

  permalink.onclick = function(event) {
    event.preventDefault();

    location.hash = '#' + hash;

    Array.from(document.querySelectorAll('.highlight')).forEach(
      (el) => el.classList.remove('highlight')
    );

    div.classList.add('highlight');

    //document.getElementById('search-bar').value = hash;
    //console.log(hash);
  }

  const reply = document.createElement('a');
  reply.innerHTML = '<img src="reply.svg" alt="Reply" />';

  reply.onclick = function() {
    window.foo = this;
    if (window.mode == "Toastr") {
      var form = this.parentElement.parentElement.parentElement.nextSibling.querySelector('& > .toast-new');
    } else if (window.mode == "Trollbox") {
      var form = document.querySelector('.toast-new-form');
      form.querySelector('.reply-details .heading').innerHTML = 'Replying to:';

      var replyAuthor = getReplyAuthor(this.parentElement.parentElement.parentElement.parentElement);
      form.querySelector('.reply-details .username').innerHTML = replyAuthor.username;
      form.querySelector('.reply-details .pubkey').innerHTML = replyAuthor.pubkey;
      form.querySelector('.reply-details .avatar').innerHTML = replyAuthor.avatar;

      form.querySelector('.reply-details .content').innerHTML = this.parentElement.parentElement.querySelector('.content .caption').innerHTML;
      form.querySelector('.reply-details .tags').innerHTML = this.parentElement.parentElement.querySelector('.content .tags').innerHTML;
      form.querySelector('.reply-details').classList.remove('hidden');
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'smooth'
      });
    }
  }

  const link = document.createElement('a');
  link.classList += 'raw';
  link.onclick = function(event) {
    event.preventDefault();
    console.log(note);
    writeClipboardText(JSON.stringify(note));
  }

  link.innerHTML = '<img src="code.svg" alt="Copy Raw" />';
  div.querySelector('footer').prepend(link)
  div.querySelector('footer').prepend(reply)
  div.querySelector('footer').prepend(permalink)

  if (date !== null) {
    parent.appendChild(date);
  }

  // Chat messages display the author above the post, to allow for multiple posts from one person in a row.
  if (author !== null) {
    parent.appendChild(author);
  }

  parent.appendChild(div)
}

async function writeClipboardText(text) {
  if (text === undefined) {
    text = "<blank>";
  }

  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    console.error(error.message);
  }
}

initSqlJs(config).then(function(SQL){
  window.importToast = function(value, immediateWrite) {
    var note = JSON.stringify(value);

    var taggedUrl = '';
    var rValue = '';
    value["tags"].forEach((tag) => {
      if (tag[0] == "r") {
        if (tag[1].toLowerCase().startsWith('http')) {
          taggedUrl = tag[1];
        }
        rValue = tag[1];
      }
    });

    if (window.mode == "Toastr") {
      const url = new URL(taggedUrl);
      var domain = url.hostname.toLowerCase();
    } else if (window.mode == "Trollbox") {
      // just use the room name as the raw value
      // in the future, grab it from the content tag for Trollbox
      var url = rValue;
      var domain = rValue;
    }

    console.log('Inserting ' + value['id'] + ' into Toasts DB...');
    db.run("INSERT OR IGNORE INTO toasts (id, created_at, domain, url, pubkey, kind, note) VALUES (?, ?, ?, ?, ?, ?, ?)", [value['id'], value['created_at'], domain, taggedUrl, value['pubkey'], value['kind'], note]);

    if (immediateWrite) {
      var dbstr = toBinString(window.db.export());
      window.localStorage.setItem("trollbox.sqlite", dbstr);
    }
  }

  window.importNote = function(value, immediateWrite) {
    var dirty = false;
    var note = JSON.stringify(value);
    if (value['kind'] == 0) {
      var existing_note_length = db.exec("SELECT * FROM notes WHERE pubkey = ? AND kind = 0", [value['pubkey']]).length
      if (existing_note_length == 0) {
        console.log('Inserting ' + value['id'] + ' into Notes DB...');
        window.users[value['pubkey']] = value;
        if (value['pubkey'] == window.pubKey) {
          displayProfile(window.pubKey);
        }
        db.run("INSERT INTO notes (id, created_at, pubkey, kind, note) VALUES (?, ?, ?, ?, ?)", [value['id'], value['created_at'], value['pubkey'], value['kind'], note]);
        dirty = true;
        console.log('Adding ' + value['pubkey'] + ' to window.users...');
      } else {
        console.log('Updating ' + value['id'] + ' into Notes DB...');
        window.users[value['pubkey']] = value;
        if (value['pubkey'] == window.pubKey) {
          displayProfile(window.pubKey);
        }
        db.run("UPDATE notes SET id = ? created_at = ?, kind = ?, note = ? WHERE pubkey = ? AND created_at < ?)", [value['id'], value['created_at'], value['kind'], note, value['pubkey'], value['created_at']]);
        dirty = true;
        console.log('Adding ' + value['pubkey'] + ' to window.users...');
      }
    } else if (value['kind'] == 42) {
      // Confirm it isn't a toast...
      var isToast = false;
      value["tags"].forEach((tag) => {
        if (tag[0] == "t" && tag[1].toLowerCase().startsWith('toastr')) {
          console.log("This is a toast - rejecting from Notes DB")
          isToast = true;
        }
      });

      if (isToast) {
        return
      }

      console.log('Inserting ' + value['id'] + ' into Notes DB...');
      db.run("INSERT OR IGNORE INTO notes (id, created_at, pubkey, kind, note) VALUES (?, ?, ?, ?, ?)", [value['id'], value['created_at'], value['pubkey'], value['kind'], note]);
      dirty = true;
      console.log('Adding ' + value['id'] + ' to notes');
    } else {
      console.log('Not inserting ' + value['id'] + ' into Notes DB - not a valid kind 0 event'); // Worry about non-kind 0 stuff later
    }
    if (dirty && immediateWrite) {
      var dbstr = toBinString(window.db.export());
      window.localStorage.setItem("trollbox.sqlite", dbstr);
    }
  }

  var dbVersion = window.localStorage.getItem("version");
  var dbstr = window.localStorage.getItem("trollbox.sqlite");

  if (dbstr && dbVersion !== null && dbVersion == window.version) {
    console.log("Loading existing database - version numbers match");
    var db = new SQL.Database(toBinArray(dbstr));
  } else {
    console.log("Database version mismatch or undefined - creating a new DB");
    var db = new SQL.Database();
    db.run("CREATE TABLE IF NOT EXISTS toasts (id TEXT NOT NULL PRIMARY KEY, created_at INTEGER NOT NULL, domain TEXT NOT NULL, url TEXT NOT NULL, pubkey TEXT NOT NULL, kind INTEGER NOT NULL, note TEXT NOT NULL);");
    db.run("CREATE TABLE IF NOT EXISTS notes (id TEXT NOT NULL PRIMARY KEY, created_at INTEGER NOT NULL, pubkey TEXT NOT NULL, kind INTEGER NOT NULL, note TEXT NOT NULL);");
    db.run("CREATE INDEX idx_toasts_domain ON toasts (domain);")
  }

  var dbstr = toBinString(db.export());
  window.localStorage.setItem("trollbox.sqlite", dbstr);
  window.localStorage.setItem("version", window.version);
  window.db = db;

  if (typeof browser !== "undefined" && typeof browser.tabs !== "undefined") {
    // Firefox Extension
    window.browserExtension = true;

    browser.tabs.onActivated.addListener( function(activeInfo){
      browser.tabs.get(activeInfo.tabId, function(tab){
        setExtensionIcon(tab, tab.url);
      });
    });

    browser.tabs.onUpdated.addListener((tabId, change, tab) => {
      if (tab.active && change.url) {
        setExtensionIcon(tab, change.url);
      }
    });

    browser.tabs.query({
      active: true,
      currentWindow: true
    }, function(tabs) {
      searchBar.value = tabs[0].url;
      searchResults(document.getElementById('search-bar').value);
    });
  } else {
    // Not a browser extension
    window.browserExtension = false;
  }

  console.log("Cached Notes: " + db.exec("SELECT COUNT(*) FROM notes")[0].values[0][0]);
  console.log("Cached Toasts: " + db.exec("SELECT COUNT(*) FROM toasts WHERE kind = 1")[0].values[0][0]);

  // Start Nostr connections
  var sk = localStorage.getItem('privkey');
  var pk;

  if (typeof window.nostr !== 'undefined') {
    // Detected NIP-07 support
    document.querySelector('#keys input[name="privkey"]').value = "NIP-07 supported - using browser keys";
    document.querySelector('#keys input[name="privkey"]').disabled = true;
    window.nostr.getPublicKey().then(pubKey => {
      displayProfile(pubKey);
      return pubKey;
    })
    document.querySelector('#keys button').disabled = true;
  } else if (sk === null) {
    document.querySelector('#keys input[name="privkey"]').value = window.NostrTools.nip19.nsecEncode(window.NostrTools.generateSecretKey());
    localStorage.setItem("privkey", document.querySelector('#keys input[name="privkey"]').value);
    sk = Uint8Array.from(window.NostrTools.nip19.decode(localStorage.getItem('privkey')).data);
    pk = window.NostrTools.getPublicKey(sk);
  } else {
    sk = Uint8Array.from(window.NostrTools.nip19.decode(localStorage.getItem('privkey')).data);
    document.querySelector('#keys input[name="privkey"]').value = localStorage.getItem('privkey');
    pk = window.NostrTools.getPublicKey(sk);
  }

  document.querySelector('#keys input[name="privkey"]').addEventListener("change", function() {
    pk = window.NostrTools.getPublicKey(sk) // `pk` is a hex string
  });

  window.pool = new window.NostrTools.SimplePool()

  window.relays = getRelays();

  var dirty = false;
  document.querySelector('#keys input[name="privkey"]').disabled = true;

  if (pk) {
    displayProfile(pk);
  }

  var filter;
  var kind;
  if (window.mode == "Toastr") {
    kind = 1;
    filter = {kinds: [kind], '#t': ["toastr"], since: 1750046400};
  } else if (window.mode == "Trollbox") {
    kind = 40;
    filter = {kinds: [kind], '#t': ["trollbox"], since: 1750046400}
  }

  var h = window.pool.subscribeMany(
    relays,[
      filter
    ],
    {
      onevent(event) {
        if (event && event.pubkey && event.content && event.kind == 40 && window.NostrTools.verifyEvent(event, event.pubkey) && event.created_at > 1750046400) {
          importToast(event, window.hasFinishedLoading); // if the page has finished loading, save the DB in response to any change.
          dirty = true;
        }
      },
      oneose() {
        if (dirty) {
          var dbstr = toBinString(window.db.export());
          window.localStorage.setItem("trollbox.sqlite", dbstr);
        }
        fetchNotes();
        //h.close();
      }
    }
  )

  function fetchNotes() {
    var filters = [];
    var kind;
    if (window.mode == "Toastr") {
      var stmt = window.db.prepare("SELECT * FROM toasts WHERE kind = 1");
      kind = 1; // children of toasts are also kind 1
    } else if (window.mode == "Trollbox") {
      var stmt = window.db.prepare("SELECT * FROM toasts WHERE kind = 40");
      kind = 42; // children of channel messages are actually kind 42
    }
    while(stmt.step()) {
      const row = stmt.getAsObject();
      var event = JSON.parse(row.note);
      if (window.mode == "Toastr") {
        filters.push({kinds: [1], '#e': [event.id]});
      } else if (window.mode == "Trollbox") {
        filters.push({kinds: [42], '#e': [event.id]});
      }
    }

    window.filters = filters;
    console.log('filters: '+ filters.toString());

    var h = window.pool.subscribeMany(
      relays, filters,
      {
        onevent(event) {
          if (event && event.pubkey && event.content && event.kind == kind && window.NostrTools.verifyEvent(event, event.pubkey)) {
            importNote(event, window.hasFinishedLoading); // if the page has finished loading, save the DB in response to any change.
            if (window.hasFinishedLoading) { // Trigger a redraw if this is after the initial load...
              if (document.getElementById('search-bar').value == "") { // If yes
                drawToasts(document.querySelector('.toasts-container'), window.users, "recent");
                window.lastDrawMode = "recent";
              } else { // If no.

                // Only redraw rooms we're actually in if a new message comes in - otherwise, just ignore it.
                var weShouldRedraw = false;
                if (document.getElementById('search-bar').value.startsWith('note')) {
                  var activeRoom = window.NostrTools.nip19.decode(document.getElementById('search-bar').value).data;

                  event["tags"].forEach((tag) => {
                    if (tag[0] == "e" && tag[3] && tag[3] == 'root' && tag[1] == activeRoom) {
                      weShouldRedraw = true;
                    }
                  });
                }

                if (weShouldRedraw) {
                  var shouldScroll = false;
                  // If the user is at the bottom of the page, we should scroll down again if a new message is received.
                  if (document.documentElement.scrollTop == document.documentElement.scrollTopMax) {
                    shouldScroll = true;
                  }
                  if (event.pubkey != pubKey) {
                    snd.play(); // play sounds, but only if you didn't send the message
                  }
                  searchResults(document.getElementById('search-bar').value);
                  if (shouldScroll) {
                    window.scrollTo({
                      top: document.body.scrollHeight,
                      behavior: 'smooth'
                    });
                  }
                }
              }
            }
          }
        },
        oneose() {
          console.log('EOSE on notes/messages - Calling fetchAuthorInfo...');
          fetchAuthorInfo();

          //h.close();
        }
      }
    )
  }

  const searchBar = document.getElementById('search-bar');
  window.searchResults = (searchValue) => {
    var mode = '';
    if (!searchValue || searchValue == "" || searchValue == "https://" || searchValue == "http://") {
      mode = 'recent';
    } else if ((searchValue.startsWith('https://') || searchValue.startsWith('http://')) && (searchValue.split("/").length - 1) > 2) {
      if (window.mode == "Toastr") {
        mode = 'url-' + searchValue;
      } else if (window.mode == "Trollbox") {
        // Trollbox only supports one chat room per domain, so URL-mode isn't a thing
        if (searchValue.startsWith('https://')) {
          searchValue = searchValue.substring(8, searchValue.length);
        } else if (searchValue.startsWith('http://')) {
          searchValue = searchValue.substring(7, searchValue.length);
        }
        searchValue = searchValue.split('/')[0]
        mode = 'domain-' + searchValue;
      }
    } else if (searchValue.startsWith('npub')) {
      mode = 'profile-' + searchValue;
    } else if (searchValue.startsWith('note') || searchValue.startsWith('nevent')) {
      mode = 'toast-' + searchValue;
    } else {
      if (searchValue.startsWith('https://')) {
        searchValue = searchValue.substring(8, searchValue.length);
      } else if (searchValue.startsWith('http://')) {
        searchValue = searchValue.substring(7, searchValue.length);
      }
      mode = 'domain-' + searchValue;
    }

    document.querySelectorAll('#topbar nav .right > a').forEach(l => {
      l.classList.remove("active");
    });

    document.querySelector('#logoLink').classList.add("active")
    document.querySelectorAll('#container article').forEach(l => {
      l.style.display = 'none';
    });
    document.querySelector('#trollbox').style.display = 'block';
    drawToasts(document.querySelector('.toasts-container'), window.users, mode);
    window.lastDrawMode = mode;
  };

  var logoLink = document.querySelector('a#logoLink');
  logoLink.onclick = function(event) {
    event.preventDefault();
    history.pushState({hash: ''}, "Home", '#' + '');
    document.getElementById('search-bar').value = '';
    searchResults(document.getElementById('search-bar').value);
  }

  window.addEventListener('popstate', function(event) {
    if (event.state) {
      state = event.state;
      document.title = state.title;
      document.getElementById('search-bar').value = state.hash;
      searchResults(document.getElementById('search-bar').value);
    }
  });

  const debounce = (fn, delay = 1000) => {
    let timerId = null;
    return (...args) => {
      clearTimeout(timerId);
      timerId = setTimeout(() => fn(...args), delay);
    };
  };

  const onInput = debounce(searchResults, 500);
  searchBar.addEventListener("input", (e) => {
    onInput(e.target.value);
  });

  function onlyUnique(value, index, array) {
    return array.indexOf(value) === index;
  }

  function fetchAuthorInfo() {
    var userPubkeys = [];
    var dirty = false;

    // Get the public keys of everyone who's written a toast
    if (window.mode == "Toastr") {
      var stmt = db.prepare("SELECT * FROM toasts WHERE kind = 1");
    } else if (window.mode == "Trollbox") {
      var stmt = db.prepare("SELECT * FROM toasts WHERE kind = 40");
    }

    while(stmt.step()) {
      const row = stmt.getAsObject();
      var event = JSON.parse(row.note);
      userPubkeys.push(event.pubkey)
    }

    // Get the public keys of everyone who's written a note
    if (window.mode == "Toastr") {
      var stmt = db.prepare("SELECT * FROM notes WHERE kind = 1");
    } else if (window.mode == "Trollbox") {
      var stmt = db.prepare("SELECT * FROM notes WHERE kind = 42");
    }
    while(stmt.step()) {
      const row = stmt.getAsObject();
      var event = JSON.parse(row.note);
      userPubkeys.push(event.pubkey)
    }

    // Suppress duplicate authors
    userPubkeys = userPubkeys.filter(onlyUnique);

    console.log("userPubkeys: " + userPubkeys);

    var h = window.pool.subscribeMany(
      relays,[
        {kinds: [0], authors: userPubkeys}
      ],
      {
        onevent(event) {
          if (event && event.pubkey && event.kind == 0) {
            importNote(event, window.hasFinishedLoading); // if the page has finished loading, save the DB in response to any change.
            dirty = true;
          }
        },
        oneose() {
          if (dirty) {
            var dbstr = toBinString(window.db.export());
            window.localStorage.setItem("trollbox.sqlite", dbstr);
          }
          if (!window.hasFinishedLoading) {
            if (!window.browserExtension) {
              // Draw the new toast UI
              newToast(document.querySelector('#newToastContainer'), {url: ''});

              // Ready to draw page contents - has someone attempted a search (via the URL slug) ?
              if (window.location.hash) {
                document.getElementById('search-bar').value = window.location.hash.substring(1, window.location.hash.length)
              } else {
                // Fragment doesn't exist
              }

              if (document.getElementById('search-bar').value == "") { // If yes
                searchResults(document.getElementById('search-bar').value);
              } else { // If no.
                searchResults(document.getElementById('search-bar').value);
              }
            }
            window.hasFinishedLoading = true;
          }
          //h.close();
        }
      }
    )
  }

  function drawToasts(container, knownUsers, mode) {
    console.log("Drawing Toasts! - Mode = " + mode);
    try {
      container.querySelector('.toasts-loading').classList.add("active");
      container.querySelector('.toasts').innerHTML = '';
      if (window.lastDrawMode != mode) {
        container.querySelector('.toast-new').remove();
      }
      container.querySelector('.toast-new-button').remove();
    } catch (e) {}

    var users = {}
    var stmt = db.prepare("SELECT * FROM notes WHERE kind = 0");
    while(stmt.step()) {
      const row = stmt.getAsObject();
      var event = JSON.parse(row.note);
      users[event.pubkey] = event;
    }

    if (mode.slice(-1) == '#') {
      mode = mode.substring(0, mode.length - 1);
    }

    var emptyMsg = '';
    var pageTitle;
    var pageSubTitle;
    var shouldShowHeadings = false;
    var shouldShowMessages = false;
    var showEmptyMessage = true;

    if (mode.startsWith("domain-")) {
      console.log("Filtering to domain name " + mode.substring(7));

      if (window.mode == "Toastr") {
        stmt = db.prepare("SELECT * FROM toasts WHERE kind = 1 AND domain = $domain ORDER BY created_at DESC");
        emptyMsg = "Sorry, there are no toasts for the domain " + mode.substring(7);
        pageTitle = 'Search Results'
        pageSubTitle = 'Domain: ' + mode.substring(7);
      } else if (window.mode == "Trollbox") {
        stmt = db.prepare("SELECT * FROM toasts WHERE kind = 40 AND domain = $domain ORDER BY created_at DESC");
        emptyMsg = "Sorry, there are no channels for the domain " + mode.substring(7);
        pageTitle = 'Search Results'
        pageSubTitle = 'Domain: ' + mode.substring(7);
      }

      stmt.bind({$domain: mode.substring(7)});

      shouldShowHeadings = true;
      shouldShowMessages = false;

    } else if (mode == "recent") {
      if (window.mode == "Toastr") {
        stmt = db.prepare("SELECT * FROM toasts WHERE kind = 1 ORDER BY created_at DESC");
        emptyMsg = "Sorry, there are no recent toasts";
        pageTitle = 'Recent Toasts'
        pageSubTitle = '';
      } else if (window.mode == "Trollbox") {
        stmt = db.prepare("SELECT * FROM toasts WHERE kind = 40 ORDER BY created_at DESC");
        emptyMsg = "Sorry, there are no recent channels";
        pageTitle = 'Recent Channels'
        pageSubTitle = '';
      }

      shouldShowHeadings = true;
      shouldShowMessages = false;
    } else if (mode.startsWith("url-")) {
      stmt = db.prepare("SELECT * FROM toasts WHERE kind = 1 AND url = $url ORDER BY created_at DESC");
      console.log("Filtering to URL " + mode.substring(4));
      stmt.bind({$url: mode.substring(4)});
      emptyMsg = "Sorry, there are no toasts for URL " + mode.substring(4) + " - why not be the first to write one?";

      shouldShowHeadings = true;
      shouldShowMessages = false;

      pageTitle = 'Search Results'
      pageSubTitle = 'URL: ' + mode.substring(4);
    } else if (mode.startsWith("profile")) {
      if (window.mode == "Toastr") {
        stmt = db.prepare("SELECT * FROM toasts WHERE kind = 1 AND pubkey = $pubkey ORDER BY created_at DESC");
      } else if (window.mode == "Trollbox") {
        stmt = db.prepare("SELECT * FROM toasts WHERE kind = 40 AND pubkey = $pubkey ORDER BY created_at DESC");
      }
      console.log("Filtering to profile " + mode.substring(8));
      var pubkey = window.NostrTools.nip19.decode(mode.substring(8)).data;
      stmt.bind({$pubkey: pubkey})

      shouldShowHeadings = true;
      shouldShowMessages = false;

      var username = '';
      if (users[pubkey]) {
        var user = JSON.parse(users[pubkey].content);
        username = user.name;
      }
      else {
        username = 'Unknown';
      }

      if (window.mode == "Toastr") {
        emptyMsg = "Sorry, there are no toasts from profile " + mode.substring(8) + ' (' + pubkey + ')';
        pageTitle = 'Toasts from ' + username;
      } else if (window.mode == "Trollbox") {
        emptyMsg = "Sorry, there are no channels from profile " + mode.substring(8) + ' (' + pubkey + ')';
        pageTitle = 'Channels from ' + username;
      }

      pageSubTitle = mode.substring(8);
    } else if (mode.startsWith("toast")) {
      if (window.mode == "Toastr") {
        stmt = db.prepare("SELECT * FROM toasts WHERE kind = 1 AND id = $id ORDER BY created_at DESC");
      } else if (window.mode == "Trollbox") {
        stmt = db.prepare("SELECT * FROM toasts WHERE kind = 40 AND id = $id ORDER BY created_at DESC");
      }

      var query = mode.split('-')[1];

      console.log("Filtering to toast " + query);

      if (query.startsWith("note")) {
        var id = window.NostrTools.nip19.decode(query).data;
      } else if (query.startsWith('nevent')) {
        var id = window.NostrTools.nip19.decode(query).data.id;
      }

      stmt.bind({$id: id});

      shouldShowHeadings = false;
      shouldShowMessages = true;

      if (window.mode == "Toastr") {
        pageTitle = 'Viewing Thread';
        emptyMsg = "Sorry, there are no toasts corresponding to " + mode.substring(6) + ' (' + id + ')';
      } else if (window.mode == "Trollbox") {
        var channelName = 'Unknown';
        while (stmt.step()) {
          try {
            channelName = JSON.parse(JSON.parse(stmt.getAsObject()["note"])["content"])["name"];
          } catch (e) { // Ignore it and just use Unknown for now
          }
        }

        pageTitle = 'Channel' + ' ' + channelName;
        emptyMsg = "Sorry, there are no notes corresponding to " + mode.substring(6) + ' (' + id + ')';
      }
      pageSubTitle = mode.substring(6);

    } else if (mode.startsWith("replies-")) {
      shouldShowHeadings = false;
      shouldShowMessages = true;

      console.log('Loading replies for ' + mode.substring(8));
      var dirty = false;
      var replies = [];

      // TODO: rewrite this to not use LIKE, and properly search for replies
      // This is only doable with an index of tags though.
      // {kinds: [1], '#e': [mode.substring(8), "", "root/reply"]}

      if (window.mode == "Toastr") {
        stmt = db.prepare("SELECT * FROM notes WHERE kind = 1 AND id <> $id AND note LIKE $noteid ORDER BY created_at ASC");
      } else if (window.mode == "Trollbox") {
        stmt = db.prepare("SELECT * FROM notes WHERE kind = 42 AND id <> $id AND note LIKE $noteid ORDER BY created_at ASC");
      }
      stmt.bind({$id: mode.substring(8), $noteid: '%' + mode.substring(8) + '%'});

      emptyMsg = "";

      // This is called from within a thread - there's no need to set the page title or subtitle
    } else if (mode.startsWith("messages-")) {
      shouldShowHeadings = false;
      shouldShowMessages = false;

      console.log('Loading messages for ' + mode.substring(9));
      var dirty = false;
      var replies = [];

      // TODO: rewrite this to not use LIKE, and properly search for replies
      // This is only doable with an index of tags though.
      // {kinds: [1], '#e': [mode.substring(9), "", "root/reply"]}

      stmt = db.prepare("SELECT * FROM notes WHERE kind = 42 AND note LIKE $noteid ORDER BY created_at ASC");
      stmt.bind({$noteid: '%' + mode.substring(9) + '%'});

      emptyMsg = "";

      // This is called from within a thread - there's no need to set the page title or subtitle
    }

    var row;

    var lastPubkey = null;
    var lastTimestamp = null;

    while(true) {
      if (stmt.step()) {
        row = stmt.getAsObject();
        showEmptyMessage = false;
      } else {
        break;
      }

      var event = JSON.parse(row.note);

      // Our database code currently does not support properly parsing the tag column of Nostr notes,
      // so you can't just ask for 'direct children of note X' - instead, you have to ask for notes
      // that reference X, which might include great-great-grandchildren, or other insane relationships.
      // Then you have to parse every response to the query and actually perform the check by parsing
      // the note directly, and short circuit rendering if it isn't actually what you wanted.

      var parent = '';

      if (mode.startsWith("messages-")) {
        // Copy all of the e Tags from the references in the parent post
        event["tags"].forEach((tag) => {
          if (tag[0] == "e" && tag[3] == "root") {
            parent = tag[1];
          }
        });

        if (parent != mode.substring(9)) {
          continue; // Cancel rendering if the parent isn't actually an exact match.
        }
      }

      if (mode.startsWith("replies-")) {
        // Copy all of the e Tags from the references in the parent post
        event["tags"].forEach((tag) => {
          if (tag[0] == "e") {
            parent = tag[1];
          }
        });

        if (parent != mode.substring(8)) {
          continue; // Cancel rendering if the parent isn't actually an exact match.
        }
      }

      var username = 'Unknown';
      var avatarURL = null;
      if (users[event.pubkey]) {
        var user = JSON.parse(users[event.pubkey].content);
        if (typeof user.picture !== 'undefined') {
          avatarURL = user.picture;
        }
        if (typeof user.name !== 'undefined') {
          username = user.name;
        }
      }
      if (shouldShowHeadings) {
        var article = document.createElement('div');

        if (window.mode == "Toastr") {
          var ccStmt = db.prepare("SELECT COUNT(*) FROM notes WHERE kind = 1 AND id <> $id AND note LIKE $noteid");
          article.classList += 'toast';
        } else if (window.mode == "Trollbox") {
          var ccStmt = db.prepare("SELECT COUNT(*) FROM notes WHERE kind = 42 AND id <> $id AND note LIKE $noteid");
          var pStmt = db.prepare("SELECT COUNT(DISTINCT pubkey) FROM notes WHERE kind = 42 AND id <> $id AND note LIKE $noteid");
          pStmt.bind({$id: event.id, $noteid: '%' + event.id + '%'});

          var isParticipantStmt = db.prepare("SELECT COUNT(*) FROM notes WHERE kind = 42 AND id <> $id AND note LIKE $noteid AND pubkey = $pubkey");
          isParticipantStmt.bind({$id: event.id, $noteid: '%' + event.id + '%', $pubkey: window.pubKey});

          var isParticipant = false;
          if (isParticipantStmt.step()) {var isParticipantCount = isParticipantStmt.getAsObject()["COUNT(*)"]}
          var isParticipant = isParticipantCount > 0;

          article.classList += 'toast';
        }
        ccStmt.bind({$id: event.id, $noteid: '%' + event.id + '%'});

        if (ccStmt.step()) {var messagesCount = ccStmt.getAsObject()["COUNT(*)"]}
        var messagesString = '';

        if (window.mode == "Toastr") {
          if (messagesCount != 1) {
            messagesString = 'comments';
          } else {
            messagesString = 'comment';
          }
        } else if (window.mode == "Trollbox") {
          if (messagesCount != 1) {
            messagesString = 'messages';
          } else {
            messagesString = 'message';
          }
        }

        var participantsString = '';
        if (pStmt.step()) {var participantsCount = pStmt.getAsObject()["COUNT(DISTINCT pubkey)"]}

        if (participantsCount != 1) {
          participantsString = 'users';
        } else {
          participantsString = 'user';
        }

        var epochTimestamp = new Date(0);
        epochTimestamp.setUTCSeconds(event.created_at);

        if (window.mode == "Toastr") {
          var innerHTML = `<h2><a href="${row.url}">${event.content}</a></h2>
          <p><a class="messages"></a> &middot; ${epochTimestamp.toLocaleString()} <span class="middot">&middot;</span><br /> <a class="domain"></a> &middot; submitted by <a class="submitter"></a> </p>
          `
        } else if (window.mode == "Trollbox") {
          var roomName = 'Unknown';

          try {
            roomName = JSON.parse(event.content)["name"];
          } catch (e) {
            roomName = event.content + ' *';
          }
          var innerHTML = `<h2><a class="title">${roomName}</a></h2>
          <p><a class="messages"></a> <span class="middot">&middot;</span> <a class="participants">${participantsCount} ${participantsString}</a> <span class="middot">&middot;</span> ${isParticipant}</p>
          `
        }
        article.innerHTML = innerHTML;
        container.querySelector('.toasts').appendChild(article);

        var messagesLink = article.querySelector('a.messages');
        messagesLink.innerHTML = `${messagesCount} ${messagesString}`
        messagesLink.onclick = function(event) {
          event.preventDefault();
          document.getElementById('search-bar').value = event.target.dataset.id;
          searchResults(document.getElementById('search-bar').value);
          history.pushState({hash: event.target.dataset.id, title: document.title}, '', '#' + event.target.dataset.id);
        }
        messagesLink.href = '#' + window.NostrTools.nip19.noteEncode(event.id);
        messagesLink.dataset.id = window.NostrTools.nip19.noteEncode(event.id);

        if (window.mode == "Trollbox") {
          var titleLink = article.querySelector('a.title');
          titleLink.onclick = messagesLink.onclick;
          titleLink.href = '#' + window.NostrTools.nip19.noteEncode(event.id);
          titleLink.dataset.id = window.NostrTools.nip19.noteEncode(event.id);
        }

        try { // Toastr only
          var domainLink = article.querySelector('a.domain');
          domainLink.innerHTML = `${row.domain}`
          domainLink.onclick = function(event) {
            event.preventDefault();
            document.getElementById('search-bar').value = event.target.dataset.domain;
            searchResults(document.getElementById('search-bar').value);
            history.pushState({hash: event.target.dataset.domain, title: document.title}, '', '#' + event.target.dataset.domain);
          }
          domainLink.href = '#' + row.url;
          domainLink.dataset.domain = row.domain;
          domainLink.dataset.url = row.url;

          var submitterLink = article.querySelector('a.submitter');
          submitterLink.innerHTML = `${username}`
          submitterLink.onclick = function(event) {
            event.preventDefault();
            document.getElementById('search-bar').value = event.target.dataset.pubkey;
            searchResults(document.getElementById('search-bar').value);
            history.pushState({hash: event.target.dataset.pubkey, title: document.title}, '', "#" + event.target.dataset.pubkey);
          }

          submitterLink.href = '#' + window.NostrTools.nip19.npubEncode(event.pubkey);
          submitterLink.dataset.pubkey = window.NostrTools.nip19.npubEncode(event.pubkey);
        } catch {}

      } 

      if (!shouldShowHeadings && !mode.startsWith("toast")) {
        // TODO: populate this
        var isReply = false;
        var reply = {};
        displayToast(container.querySelector('.toasts'), {username: username, pubkey: event.pubkey, message: event.content, avatarURL: avatarURL, isReply: isReply, reply: reply, created_at: event.created_at}, event, {lastPubkey: lastPubkey, lastTimestamp: lastTimestamp, users: users});
        lastPubkey = event.pubkey;
        lastTimestamp = event.created_at;
      }

      if (shouldShowMessages) {
        // Draw replies

        const children = document.createElement('div');
        children.classList.add('children');

        container.querySelector('.toasts').appendChild(children);

        const toasts = document.createElement('div');
        toasts.classList.add('toasts');
        children.appendChild(toasts);

        var marker = 'root';
        // Copy all of the e Tags from the references in the parent post
        var eTags = [];
        event["tags"].forEach((tag) => {
          if (tag[0] == "e") {
            eTags.push(tag);
            if (tag[3] && tag[3] == 'root') {
              marker = 'reply'; // If there's a root e tag defined, mark it as a reply instead.
            }
          }
        });

        // Add the parent post itself as a reference
        eTags.push(['e', event.id, '', marker, event.pubkey]);
        if (window.mode == "Toastr") {
          newNote(children, {eTags: eTags});
        }
        drawToasts(container.querySelector('.toasts'), knownUsers, "messages-" + event.id);

        console.log('mode:' + container.querySelector('.toasts').children.length);

        var classFilter = '';
        if (window.mode == "Toastr") {
          classFilter = '.toast';
        } else if (window.mode == "Trollbox") {
          classFilter = '.note';
        }

        if (!document.querySelector('.toasts ' + classFilter) && mode.startsWith('toast-')) {
          // Add text if there are currently no messages.
          showEmptyMessage = true;
          emptyMsg = 'no messages (yet) - why not be the first to write one?'
        }
      }
    }

    if (pageTitle !== undefined) {
      if (pageTitle !== undefined) {
        document.querySelector('h1#title').innerHTML = pageTitle;
        document.title = 'Trollbox - ' + pageTitle;
      }

      if (pageSubTitle !== undefined) {
        document.querySelector('h2#subtitle').innerHTML = pageSubTitle;
      } else {
        document.querySelector('h2#subtitle').innerHTML = '';
      }
    }

    try {
      container.querySelector('.toasts-loading').classList.remove("active");
      if (showEmptyMessage) {
        container.querySelector('.toasts-empty').innerHTML = emptyMsg;

        // Add a button to the empty message that opens the newToast UI
        if (mode.startsWith('url-') || (window.mode == "Trollbox" && mode.startsWith('domain-'))) {
          var newButton = '<button class=\'valid\' onclick=\'document.querySelectorAll("#topbar nav .right > a")[0].click()\'>Create</button>'

          if (window.mode == "Toastr") {
            document.querySelector('#newToastContainer input[name="url"]').value = mode.substring(4);
          } else if (window.mode == "Trollbox") {
            document.querySelector('#newToastContainer input[name="url"]').value = mode.substring(7);
          }

          container.querySelector('.toasts-empty').innerHTML += '<br />' + newButton;
        }


        container.querySelector('.toasts-empty').classList.add("active");
      } else {
        container.querySelector('.toasts-empty').innerHTML = '';
        container.querySelector('.toasts-empty').classList.remove("active");
      }
      if (mode.startsWith('toast-') && window.lastDrawMode != mode) {
        newNote(container, {eTags: [['e', event.id, '', 'root', event.pubkey]], showButton: true});
      }

      if (document.getElementById('search-bar').value) {
        document.querySelector('#' + document.getElementById('search-bar').value).scrollIntoView();
      }

    } catch (e) {}
  }

  // New Root Posts
  function newToast(node, params) {
    // Grab the profile picture URL from the settings box for the time being
    var avatarURL;
    if (document.querySelector('#profile input[name="picture"]').value !== "") {
      avatarURL = document.querySelector('#profile input[name="picture"]').value
    } else {
      avatarURL = 'circle-user.svg'
    }

    var submitText;
    if (window.mode == "Toastr") {
      submitText = "Toast";
    } else if (window.mode == "Trollbox") {
      submitText = "Create";
    }

    const div = document.createElement('div');
    div.classList.add('toast-new');

    var innerHTML = `
      <div>
        <img class="avatar" src="${avatarURL}" />
        <div class="content">
          <form class="toast-new-form" autocomplete="off" onsubmit="newNoteSubmit(event)" action="">`

          if (window.mode == "Toastr") { innerHTML += `
            <input type="url" name="url" value="" placeholder="URL" required onkeydown="validateToast(event)"></input>
            <input type="text" name="title" placeholder="Write a title..." required onkeydown="validateToast(event)"></input>
          `} else if (window.mode == "Trollbox") { innerHTML += `
            <input type="text" name="url" value="" placeholder="Domain name or URL" required onkeydown="validateToast(event)"></input>
          `}

innerHTML += `<button type="submit" class="toast-submit-button">${submitText}</button>
          </form>
        </div>
      </div>
    `

    div.innerHTML = innerHTML;
    node.append(div);
  }

  // New Messages
  function newNote(node, params) {
    // Grab the profile picture URL from the settings box for the time being
    var avatarURL;
    if (document.querySelector('#profile input[name="picture"]').value !== "") {
      avatarURL = document.querySelector('#profile input[name="picture"]').value
    } else {
      avatarURL = 'circle-user.svg'
    }

    const div = document.createElement('div');
    div.classList.add('toast-new');

    var url = '';
    var eTags = [];

    if (params.eTags !== undefined) {
      // This is a reply
      eTags = params.eTags;
    }

    var renderEtags = true;

    var innerHTML = `
      <div>
        <img class="avatar" src="${avatarURL}" />
        <div class="content">
          <form class="toast-new-form" autocomplete="off" onsubmit="newNoteSubmit(event)" action="">
            <div class="middle">
              <div class="reply-details hidden">
                <div class="tags"></div>
                <button type="button" onclick="deleteReplyContent(event)" class="valid reply-cancel">×</button>

                <p class="heading"></p>
                <div class="context">
                  <div class="avatar"></div>
                  <span class="username"></span> <span class="pubkey"></span>
                  <br />
                  <div class="content"></div>
                </div>
              </div>

              <input type="hidden" name="url" value="${url}" placeholder="URL" />
            `
              renderEtags && eTags.forEach(function (tag, index) {
                innerHTML += `
              <input type="hidden" name="e" data-event-id="${tag[1]}" data-relay-url="${tag[2]}" data-marker="${tag[3]}" data-pubkey="${tag[4]}" />
            `
              })

           innerHTML += `
              <textarea type="text" name="message" placeholder="Send a message..." required minlength="1" onkeydown="validateToast(event)"></textarea>
            </div>
            <button type="submit" class="toast-submit-button">Reply</button>
          </form>
        </div>
      </div>
    `

    div.innerHTML = innerHTML;
    node.append(div);
  }
});

document.querySelectorAll('#topbar nav .right > a').forEach(link => {
  link.addEventListener("click", (e) => {
    var num = Array.from(document.querySelectorAll("#topbar nav .right > a")).indexOf(e.currentTarget);
    document.querySelectorAll('#topbar nav .right > a').forEach(l => {
      l.classList.remove("active");
    });
    e.currentTarget.classList.add("active")
    document.querySelectorAll('#container article').forEach(l => {
      l.style.display = 'none';
    });
    document.querySelectorAll('#container article')[num + 2].style.display = 'block';
    document.getElementById('search-bar').value = '';
    return false;
  });
});
