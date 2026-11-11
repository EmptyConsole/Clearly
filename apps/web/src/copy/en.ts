// Every user-facing string, keyed by message id. Grade 7 reading level, no exclamation marks.
// Placeholders are written {name} and filled by t(id, { name: value }).
// Health-adjacent strings are listed with their ids in docs/REGULATORY_REVIEW.txt.
export const en = {
  'app.name': 'Clearly',
  'app.skipLink': 'Skip to main content',
  'app.audioPromise': 'Your audio never leaves your device.',
  'nav.label': 'Main',
  'nav.home': 'Home',
  'nav.check': 'Hearing Check',
  'nav.audio': 'Clear Audio',
  'nav.back': 'Back',

  'notFound.title': 'We could not find that page',
  'notFound.body':
    'The address may be mistyped, or the page may have moved. Check the address and try again.',
  'notFound.home': 'Go to the start page',

  // Shared states
  'state.loading': 'Loading',
  'table.region': 'Table',
  'error.whatHappened': 'What happened',
  'error.whatToTry': 'What to try',
  'error.tryAgain': 'Try again',
  'error.sendFeedback': 'Send feedback',
  'error.generic.title': 'Something went wrong',
  'error.generic.body': 'This screen could not load.',
  'error.generic.try': 'Try again. If it keeps happening, reload the page.',
  'error.audio.title': 'Sound could not start',
  'error.audio.body': 'Your browser did not let Clearly play sound.',
  'error.audio.try':
    'Check that this tab is not muted and that your headphones are connected, then try again.',
  'error.storage.title': 'Your results could not be saved',
  'error.storage.body': 'This browser did not let Clearly store data on this device.',
  'error.storage.try':
    'Private or guest windows often block storage. Open Clearly in a normal window and try again.',
  'feedback.mailSubject': 'Clearly feedback',

  // Home (temporary until the M10 dashboard)
  'home.title': 'Clearer dialogue with your own headphones',
  'home.lead':
    'Clearly adjusts sound to how you hear, so speech in TV, films and videos is easier to follow.',
  'home.start': 'Set up my sound',
  'home.startHint': 'A short Hearing Check, or a 5-second quick start.',
  'home.profileTitle': 'Your sound profile',
  'home.profileEstimated': 'Estimated from your age range',
  'home.profileMeasured': 'Measured on {date}',
  'home.listen': 'Hear the difference',
  'home.checkAgain': 'Hearing Check',

  // Headphones
  'headphones.label': 'Which headphones are you using?',
  'headphones.hint': 'For example "Sony over-ears". Results are linked to these headphones.',
  'headphones.default': 'My headphones',
  'speakers.name': 'Computer speakers',

  // Estimated label
  'profile.estimated': 'Estimated',
  'profile.estimatedHint': 'Based on your age range, not on a Hearing Check.',
  'profile.moreAccurate': 'Make it more accurate (about {n} seconds)',

  // Hearing Check start
  'check.title': 'Hearing Check',
  'check.lead': 'Choose how to set up your sound. You can change it at any time.',
  'check.starter.title': 'Quick start',
  'check.starter.body': 'Pick your age range. It takes about {n} seconds and plays no sound.',
  'check.starter.action': 'Quick start',
  'check.measure.title': 'Measure my hearing',
  'check.measure.body':
    'You listen for quiet beeps in each ear. It takes about {n} seconds with headphones, or less with computer speakers.',
  'check.measure.action': 'Measure my hearing',
  'check.resume.title': 'Finish fine-tuning',
  'check.resume.body': 'You paused fine-tuning earlier. Your answers are kept until {time}.',
  'check.resume.action': 'Continue fine-tuning',
  'check.resume.discard': 'Start over instead',

  // Starter
  'starter.title': 'How old are you?',
  'starter.lead':
    'Hearing tends to change with age. Clearly uses typical hearing for your age range as a starting point.',
  'starter.age.under-40': 'Under 40',
  'starter.age.40-49': '40 to 49',
  'starter.age.50-59': '50 to 59',
  'starter.age.60-69': '60 to 69',
  'starter.age.70-79': '70 to 79',
  'starter.age.80-plus': '80 or over',
  'starter.done.title': 'Your starting sound is ready',
  'starter.done.body':
    'It is a gentle boost based on your age range. Listen to the difference, then measure your hearing for a closer match.',
  'starter.done.listen': 'Hear the difference now',
  'starter.saving': 'Saving your starting sound',

  // Pre-check
  'pre.title': 'Before you start',
  'pre.item.headphones': 'Put your headphones on.',
  'pre.item.speakers': "Sit facing your computer, about an arm's length from the speakers.",
  'pre.output.legend': 'What will you listen with?',
  'pre.output.headphones': 'Headphones',
  'pre.output.speakers': 'Computer speakers',
  'pre.output.speakersNote':
    'Both ears hear the speakers, so Clearly checks both ears together. To check each ear on its own, use headphones.',
  'pre.accuracySpeakers':
    'Results depend on your speakers, your volume and the room, so use them as a guide rather than a measurement.',
  'pre.item.quiet': 'Find a quiet room.',
  'pre.item.volume': 'Set your computer volume to about 40 percent.',
  'pre.accuracy':
    'Results depend on your headphones and volume, so use them as a guide rather than a measurement.',
  'pre.consent':
    'I understand Clearly is not a medical device and its results are approximate. If I notice sudden hearing change, a difference between my ears, ringing, dizziness or pain, I will see a doctor or audiologist.',
  'pre.consentNeeded': 'Please tick the box above to continue.',
  'pre.age.legend': 'Your age range',
  'pre.age.hint': 'This helps the check start near the right level. You can skip it.',
  'pre.age.skip': 'Skip',
  'pre.slowerAuto': 'Slower pace is on, because you chose 70 or over. You can change it later.',
  'pre.continue': 'Continue',

  // Calibration
  'cal.title': 'Set a comfortable level',
  'cal.reason':
    'Browsers cannot know how loud your headphones or speakers are, so Clearly measures against your own comfortable level.',
  'cal.howTo':
    'A tone will get louder. Tap the big button as soon as it is clear and comfortable, not loud.',
  'cal.start': 'Play the tone',
  'cal.tap': 'It is clear and comfortable',
  'cal.playing': 'The tone is getting louder',
  'cal.tooFast': "That was very quick. Let's try once more.",
  'cal.reachedTop': "Please turn up your computer's volume a little and try again.",
  'cal.again': 'Try again',
  'cal.done': 'Level saved',

  // Stage
  'stage.title.express': 'Listening for beeps',
  'stage.title.refine': 'Fine-tuning',
  'stage.instruction':
    'Tap whenever you hear a beep, even a very faint one. Some beeps are too quiet to hear, and that is normal.',
  'stage.button': 'I hear it',
  'stage.ear.left': 'Left ear',
  'stage.ear.right': 'Right ear',
  'stage.ear.label': 'Now testing',
  'stage.ear.both': 'Both ears (speakers)',
  'stage.progress': 'Progress',
  'stage.progressValue': '{done} of {total} pitches done',
  'stage.status.listening': 'Listening. Tap when you hear a beep.',
  'stage.status.heard': 'Got it.',
  'stage.status.paused': 'Paused. Press Resume when you are ready.',
  'stage.status.starting': 'Starting.',
  'stage.status.done': 'Finished. Working out your results.',
  'stage.slower': 'Slower pace',
  'stage.slowerHint': 'More time to answer each beep.',
  'stage.pause': 'Pause',
  'stage.resume': 'Resume',
  'stage.pauseLater': 'Pause and finish later',
  'stage.pausedSaved': 'Your answers are saved for 24 hours. Continue from the Hearing Check page.',
  'stage.begin': 'Start listening',
  'stage.beginHint':
    'Stay where you are and keep the volume as it is. The first beep comes about a second after you start.',
  'stage.liveTitle': 'Results so far',
  'stage.keys': 'You can also press Space or Enter. Press Escape to pause.',

  // Audiogram
  'audiogram.title': 'Your hearing chart',
  'audiogram.desc':
    'Pitch runs from low on the left to high on the right. Lower down means a sound had to be louder for you to hear it.',
  'audiogram.axisFreq': 'Pitch (Hz)',
  'audiogram.axisLoss': 'Extra loudness needed (dB)',
  'audiogram.right': 'Right ear',
  'audiogram.left': 'Left ear',
  'audiogram.showTable': 'Show as a table',
  'audiogram.hideTable': 'Hide the table',
  'audiogram.tableCaption': 'Extra loudness needed at each pitch, in dB',
  'audiogram.colPitch': 'Pitch (Hz)',
  'audiogram.notMeasured': 'not measured',
  'audiogram.estimated': '{n} (estimated)',
  'audiogram.empty': 'Points appear here as each pitch is finished.',

  // Results
  'results.title': 'Your results',
  'results.loading': 'Loading your results',
  'results.notFound': 'These results could not be found.',
  'results.shape.typical':
    'You heard the beeps at quiet levels across all pitches, close to typical hearing with these headphones.',
  'results.shape.high-pitch':
    'Quieter high-pitched sounds are harder for you to hear, which can make speech sound muffled.',
  'results.shape.high-pitch-notch':
    'Some upper-middle pitches were harder for you to hear than the pitches around them, which can make some speech sounds less clear.',
  'results.shape.low-pitch':
    'Quieter low-pitched sounds are harder for you to hear than high-pitched ones.',
  'results.shape.flat': 'Quieter sounds are harder for you to hear at most pitches.',
  'results.shape.mixed': 'Some pitches were harder for you to hear than others.',
  'results.reliability.label': 'How consistent your answers were',
  'results.reliability.High': 'High',
  'results.reliability.Medium': 'Medium',
  'results.reliability.Low': 'Low',
  'results.reliability.HighHint': 'Your answers were consistent.',
  'results.reliability.MediumHint': 'Your answers were mostly consistent.',
  'results.reliability.LowHint': 'Your answers were not consistent enough to use.',
  'results.low.title': "Let's try that again somewhere quieter",
  'results.low.keptPrevious': 'Clearly is still using your previous sound profile.',
  'results.low.noPrevious':
    'Clearly will use these results for now. A quieter retake will give a closer match.',
  'results.active': 'Clearly now uses these results for your sound.',
  'results.referral.title': 'A hearing check with a professional could help',
  'results.referral.body':
    'Some of your results show a pattern worth checking with a doctor or audiologist, such as a difference between your ears or more loss than Clearly is designed for. This is not a diagnosis.',
  'results.referral.continue': 'You can still continue using Clearly.',
  'results.method.express': 'Hearing Check',
  'results.method.refine': 'Hearing Check, fine-tuned',
  'results.method.starter': 'Quick start (estimated)',
  'results.meta': '{method} on {date} with {headphones}',
  'results.listen': 'Hear the difference now',
  'results.refine': 'Fine-tune (about {n} seconds)',
  'results.retake': 'Retake',
  'results.pdf': 'Save PDF',
  'results.pdfMaking': 'Making your PDF',
  'results.pdfDone': 'PDF saved.',
  'results.pdfFailed': 'The PDF could not be made. Try again.',
  'results.share': 'Share',
  'results.persist':
    'To keep your results safe, Clearly asked your browser to keep its data on this device.',
  'results.persistGranted': 'Your browser agreed to keep it.',
  'results.persistDenied':
    'Your browser may still clear it if space runs low. Make a backup in Settings to keep it safe.',

  // PDF
  'pdf.title': 'Clearly hearing chart',
  'pdf.date': 'Date: {date}',
  'pdf.method': 'Method: {method}',
  'pdf.headphones': 'Headphones: {headphones}',
  'pdf.speakers': 'Played through computer speakers: both ears together.',
  'results.speakers':
    'Checked through computer speakers, so both ears are shown together. To see each ear on its own, check again with headphones.',
  'pdf.reliability': 'Consistency of answers: {reliability}',
  'pdf.disclaimer':
    'Clearly is not a medical device. These results show how you heard these sounds with these headphones and are approximate. They are not a diagnosis. If you notice sudden hearing change, a difference between your ears, ringing, dizziness or pain, see a doctor or audiologist.',
  'pdf.fileName': 'Clearly hearing chart {date}.pdf',

  // Demo clip page (simple until the full Clear Audio player arrives)
  'demo.title': 'Hear the difference',
  'demo.lead':
    'Switch between Original and Enhanced while the clip plays. Enhanced uses your sound profile.',
  'demo.clipNote':
    'This short clip is a speech-like test sound made by Clearly, with a quiet background.',
  'demo.play': 'Play the clip',
  'demo.stop': 'Stop',
  'demo.original': 'Original',
  'demo.enhanced': 'Enhanced',
  'demo.modeLabel': 'Sound',
  'demo.noProfile': 'You do not have a sound profile yet, so Enhanced sounds the same as Original.',
  'demo.setUp': 'Set up my sound',
  'demo.nowPlaying': 'Now playing: {mode}',
  'demo.stopped': 'Stopped',
  'demo.preparing': 'Preparing the clip',

  // M04: navigation additions
  'nav.settings': 'Settings',

  // Settings
  'settings.title': 'Settings',
  'settings.lead': 'Your profiles, sound defaults, backups and privacy.',
  'settings.profile.title': 'Profiles',
  'settings.profile.lead':
    'Each profile belongs to one pair of headphones, because every pair sounds a little different. You can keep up to {n}.',
  'settings.profile.active': 'In use',
  'settings.profile.use': 'Use this profile',
  'settings.profile.headphones': 'Headphones: {name}',
  'settings.profile.notCalibrated': 'Not calibrated for these headphones yet.',
  'settings.profile.rename': 'Rename',
  'settings.profile.renameLabel': 'Profile name',
  'settings.profile.changeHeadphones': 'Change headphones',
  'settings.profile.headphonesLabel': 'Headphone name',
  'settings.profile.headphonesNote':
    'Changing the headphone name clears the level you set, so the next Hearing Check will ask for it again.',
  'settings.profile.duplicate': 'I got new headphones',
  'settings.profile.duplicateLabel': 'Name of the new headphones',
  'settings.profile.duplicateNote':
    'This copies your settings into a new profile. Then set a comfortable level with the new headphones.',
  'settings.profile.duplicateDone': 'New profile made. Set a comfortable level for it.',
  'settings.profile.calibrateNow': 'Set the level now',
  'settings.profile.limit': 'You already have {n} profiles. Delete one to make another.',
  'settings.profile.delete': 'Delete',
  'settings.profile.deleteTitle': 'Delete "{name}"?',
  'settings.profile.deleteBody':
    'This removes the profile from this device. Your Hearing Check history stays. You may want to download a backup first.',
  'settings.profile.deleteBackup': 'Download a backup first',
  'settings.profile.deleteConfirm': 'Delete profile',
  'settings.profile.none': 'You do not have a profile yet.',
  'settings.profile.demo': 'Demo',
  'settings.save': 'Save',
  'settings.cancel': 'Cancel',
  'settings.close': 'Close',

  'settings.sound.title': 'Sound defaults',
  'settings.sound.lead': 'How strongly Clearly adjusts sound for the profile in use.',
  'settings.sound.style': 'Boost style',
  'settings.sound.style.gentle': 'Gentle',
  'settings.sound.style.standard': 'Standard',
  'settings.sound.style.strong': 'Strong',
  'settings.sound.styleStarter': 'Estimated profiles always use Gentle.',
  'settings.sound.cap': 'Largest boost at any pitch: {n} dB',
  'settings.sound.strength': 'Strength: {word} ({n} percent)',
  'settings.sound.strength.off': 'Off',
  'settings.sound.strength.light': 'Light',
  'settings.sound.strength.medium': 'Medium',
  'settings.sound.strength.full': 'Full',
  'settings.sound.strength.extra': 'Extra',
  'settings.sound.noProfile': 'Set up a profile to change these.',

  'storage.title': 'Storage and backup',
  'storage.used': 'Clearly is using {used} of the space your browser allows ({quota}).',
  'storage.usedUnknown': 'This browser does not say how much space Clearly uses.',
  'storage.persisted': "Your browser will keep Clearly's data until you remove it.",
  'storage.notPersisted':
    "Your browser may clear Clearly's data if space runs low or it is not used for a while.",
  'storage.persistUnknown': "This browser does not say whether it will keep Clearly's data.",
  'storage.persistAsk': 'Ask the browser to keep it',
  'storage.persistDenied': 'The browser did not agree. A backup file keeps your settings safe.',
  'storage.backup': 'Back up my data',
  'storage.backupHint': 'Saves a file with your profiles and results. Keep it somewhere safe.',
  'storage.backupDone': 'Backup saved.',
  'storage.lastBackup': 'Last backup: {date}',
  'storage.noBackup': 'No backup made yet.',
  'storage.restore': 'Restore from file',
  'storage.restoreHint':
    'Choose a Clearly backup file. You will see what it contains before anything changes.',
  'storage.restoreTitle': 'Restore this backup?',
  'storage.restoreSummary':
    'Made on {date}. It has {profiles} profiles ({names}), {checks} Hearing Check results and {sin} speech-in-noise results.',
  'storage.restoreHistory': 'It also has {days} days of listening history.',
  'storage.restoreWarning': 'This replaces the profiles and results on this device.',
  'storage.restoreConfirm': 'Restore',
  'storage.restoreDone': 'Backup restored.',
  'storage.restoreBad.not-json':
    'This file is not a Clearly backup. Choose the file Clearly saved, which ends in .json.',
  'storage.restoreBad.not-clearly':
    'This file is not a Clearly backup. Choose the file Clearly saved.',
  'storage.restoreBad.invalid':
    'This backup file is damaged or from a newer version of Clearly, so it cannot be used.',
  'storage.reminder': 'Remind me to back up every 30 days',
  'storage.reminderHint': 'A card on the start page, nothing more.',

  'tip.persist':
    "Some browsers clear site data you haven't used for a while. Add Clearly to your Home Screen and make a backup to keep your settings safe.",
  'tip.dismiss': 'Got it',
  'reminder.title': 'Time for a backup',
  'reminder.body': 'It has been a while since you saved a backup of your settings.',
  'reminder.action': 'Back up now',
  'reminder.later': 'Not now',

  // Sync
  'sync.title': 'Back up and move to another device',
  'sync.body':
    "This creates an anonymous backup with no name or email. You get a code you can use to restore your settings on another device. Your hearing results are stored on Clearly's server, encrypted, and deleted after {months} months without use.",
  'sync.consent':
    'I agree that Clearly stores my hearing results and settings on its server, encrypted, to back them up. I can delete them at any time.',
  'sync.turnOn': 'Turn on backup',
  'sync.consentNeeded': 'Please tick the box above to turn on backup.',
  'sync.on': 'Backup is on. Changes are saved a few seconds after you make them.',
  'sync.lastSynced': 'Last backed up: {date}',
  'sync.pending': 'Saving your changes soon.',
  'sync.syncing': 'Backing up.',
  'sync.history': 'Include listening history',
  'sync.historyHint': 'Also back up your daily listening levels and saved captions.',
  'sync.getCode': 'Get a restore code',
  'sync.codeTitle': 'Your restore code',
  'sync.codeHelp':
    'On your other device, open Clearly, choose Restore from code and type this code.',
  'sync.codeExpires': 'This code works once, for the next {time}.',
  'sync.codeExpired': 'This code has expired. Make a new one.',
  'sync.copy': 'Copy',
  'sync.copied': 'Copied.',
  'sync.newCode': 'Make a new code',
  'sync.signOut': 'Sign out other devices',
  'sync.signOutHint': 'Other devices stop backing up until you give them a new restore code.',
  'sync.signOutDone': 'Other devices are signed out.',
  'sync.delete': 'Delete cloud backup',
  'sync.deleteTitle': 'Delete your cloud backup?',
  'sync.deleteBody':
    'This deletes everything Clearly stored on its server for you. Your settings on this device stay.',
  'sync.deleteConfirm': 'Delete cloud backup',
  'sync.deleted': 'Cloud backup deleted. Your settings on this device are unchanged.',
  'sync.offline': 'Not backed up yet',
  'sync.offlineBody': 'Clearly could not reach its server. Your settings are safe on this device.',
  'sync.retry': 'Retry',
  'sync.error': 'Clearly could not back up just now.',
  'sync.unreachable': 'Clearly could not reach its server. Check your connection and try again.',
  'sync.conflictTitle': 'Two versions of your settings',
  'sync.conflictBody':
    'Another device changed your settings since this device last backed up. Which version do you want to keep?',
  'sync.conflictLocal': "Keep this device's version",
  'sync.conflictLocalDate': 'Changed on this device: {date}',
  'sync.conflictRemote': 'Use the newer one',
  'sync.conflictRemoteDate': 'Saved from another device: {date}',
  'sync.share': 'Share my profile link',
  'sync.shareWarning':
    'This link contains your hearing results. Anyone with the link can see them, and it may be saved in your browser history.',
  'sync.shareMake': 'Make the link',
  'sync.shareCopy': 'Copy link',
  'sync.shareLabel': 'Profile link',

  // Restore from code
  'restore.title': 'Restore from code',
  'restore.lead': 'Type the 12-character restore code from your other device.',
  'restore.label': 'Restore code',
  'restore.hint': 'For example ABCD-EFGH-JKMN. Capital letters are not needed.',
  'restore.find': 'Find my backup',
  'restore.invalid': 'That does not look like a restore code. It has 12 letters and numbers.',
  'restore.notFound':
    'That code did not work. It may have expired or been used already. Make a new code on your other device.',
  'restore.limited': 'Too many tries. Wait 15 minutes, then try again.',
  'restore.previewTitle': 'Restore these settings?',
  'restore.confirm': 'Restore',
  'restore.done': 'Your settings are restored on this device.',
  'restore.link': 'Restore from code',

  // Share link receiver
  'share.title': 'A shared Clearly profile',
  'share.lead':
    'Someone shared a sound profile with you. Nothing is saved unless you choose to import it.',
  'share.invalid': 'This link is incomplete or damaged, so it cannot be used. Ask for a new link.',
  'share.import': 'Import this profile',
  'share.imported': 'Profile imported.',
  'share.limit': 'You already have the most profiles allowed. Delete one in Settings first.',
  'share.preview': '{name}, for {headphones}, from {date}.',

  // Demo mode
  'demo.mode.title': 'Demo mode',
  'demo.mode.label': 'Demo mode',
  'demo.mode.hint':
    'Adds three example profiles for showing Clearly to others. They are labelled Demo and never backed up.',
  'demo.mode.profile.normal': 'Normal hearing',
  'demo.mode.profile.mild-hf': 'Mild high-frequency loss',
  'demo.mode.profile.moderate': 'Moderate sloping loss',

  // About, privacy, feedback
  'about.title': 'About and privacy',
  'about.privacyLink': 'How Clearly handles your data',
  'about.feedbackLink': 'Send feedback',
  'privacy.title': 'Privacy',
  'privacy.audio':
    'Your audio never leaves your device. All sound processing happens on this device.',
  'privacy.local':
    'Your profiles and results are stored in this browser on this device. Clearly has no accounts and does no tracking or analytics.',
  'privacy.syncTitle': 'If you turn on "Back up and move to another device"',
  'privacy.syncWhat':
    'Clearly stores your profiles, settings and Hearing Check results on its server so you can restore them elsewhere. Listening history is included only if you choose.',
  'privacy.syncHow':
    'The backup has no name or email. It is encrypted on the server. Codes and access keys are stored only in scrambled form.',
  'privacy.syncNot':
    'The server never stores your audio, your IP address or details about your browser. Your address is used briefly to stop misuse, then forgotten.',
  'privacy.syncLong': 'A backup that is not used for {months} months is deleted automatically.',
  'privacy.syncDelete':
    'You can delete it at any time in Settings with "Delete cloud backup". Restore codes expire after 24 hours and work once.',
  'privacy.feedbackTitle': 'Feedback',
  'privacy.feedback':
    'If you send feedback, Clearly stores your message and the app version, nothing else.',
  'privacy.healthTitle': 'Hearing results are personal health information',
  'privacy.health':
    'Keep backup files and profile links as private as other personal documents. Anyone who has them can see your results.',
  'feedback.title': 'Send feedback',
  'feedback.lead': 'Tell us what works, what does not, or what is confusing.',
  'feedback.label': 'Your message',
  'feedback.counter': '{n} of {max} characters',
  'feedback.sent': 'This is exactly what will be sent:',
  'feedback.sentVersion': 'App version: {v}',
  'feedback.send': 'Send',
  'feedback.thanks': 'Thank you. Your message was sent.',
  'feedback.offline':
    'Clearly could not reach its server. You can send the same message by email instead.',
  'feedback.mail': 'Send by email',
  'feedback.empty': 'Please write a message first.',

  // Headphones / profile selector
  'selector.label': 'Profile and headphones',
  'selector.hint': 'Choose the profile for the headphones you are wearing.',
  'selector.option': '{name} ({headphones})',
  'selector.demoOption': '{name} (Demo)',
  'selector.new': 'New headphones',

  // Clear Audio: sources (M05)
  'audio.title': 'Clear Audio',
  'audio.lead':
    'Choose what you want to listen to. Clearly adjusts it to your hearing as it plays.',
  'audio.noProfile.title': 'Set up your sound first',
  'audio.noProfile.body':
    'Clear Audio works best with a sound profile. A quick start takes about {n} seconds.',
  'audio.noProfile.quick': 'Quick start',
  'audio.noProfile.later': 'Listen without a profile',
  'source.demo.title': 'Demo clip',
  'source.demo.body': 'A one-minute clip with two voices over background sound.',
  'source.file.title': 'A file on this device',
  'source.file.body': 'A video or audio file you own. Drop it here or choose it.',
  'source.file.choose': 'Choose a file',
  'source.file.drop': 'Drop the file to open it',
  'source.tab.title': 'A browser tab',
  'source.tab.body': 'Enhance a video playing in another tab, such as a streaming site.',
  'source.tab.start': 'Choose a tab',
  'source.system.title': 'All computer sound',
  'source.system.body':
    'Enhance whatever is playing on this computer, in any app or website. You may hear the original sound too.',
  'source.system.start': 'Start',
  'source.system.failed': 'Clearly could not hear your computer sound.',
  'source.system.failedTry':
    'Try again. If it keeps happening, set up the virtual cable, which works on every computer.',
  'source.cable.title': 'Virtual cable',
  'source.cable.body':
    'The dependable way: your video app plays into a virtual cable, and only Clearly plays to your headphones. You set it up once.',
  'source.cable.only': 'On this computer, the virtual cable is how Clearly hears other apps.',
  'source.cable.start': 'Set up the cable',
  // Settings > Desktop app (M12)
  'desktop.title': 'Desktop app',
  'desktop.shortcut.label': 'Shortcut to switch Original and Enhanced',
  'desktop.shortcut.hint':
    'Works even when Clearly is in the background. Written like CommandOrControl+Shift+E.',
  'desktop.shortcut.save': 'Save shortcut',
  'desktop.shortcut.off': 'Turn the shortcut off',
  'desktop.shortcut.on': 'The shortcut {keys} is on.',
  'desktop.shortcut.isOff': 'The shortcut is off.',
  'desktop.shortcut.failed':
    'Clearly could not use {keys}: another app may be using it, or it is not a valid shortcut. Try a different one.',
  'desktop.backup.body':
    'Clearly keeps a backup file of your profiles and settings on this computer, updated after every change.',
  'desktop.backup.show': 'Show backup folder',
  'desktop.version': 'Clearly {version}. This version does not update itself.',
  'desktop.download': 'Get the newest version (opens your browser)',
  // Virtual cable wizard (desktop app, M12)
  'cable.title': 'Set up the virtual cable',
  'cable.lead':
    'A virtual cable carries sound from your video app to Clearly, and Clearly plays it to your headphones. You hear only the enhanced sound.',
  'cable.step1':
    'Install a free virtual audio cable from its official website. Clearly cannot include one.',
  'cable.step2': "Set your computer's sound output, or just your video app's output, to the cable.",
  'cable.step3': 'Below, choose the cable as the input and your real headphones as the output.',
  'cable.step4': 'Press Start.',
  'cable.mic.title': 'See your audio devices',
  'cable.mic.body':
    'To show your devices by name, Clearly needs microphone permission. It only listens to the cable you choose. Nothing is recorded or sent anywhere.',
  'cable.mic.show': 'Show my audio devices',
  'cable.mic.deniedTitle': 'Clearly cannot see your devices',
  'cable.mic.denied': 'Microphone permission was turned down, so the device names are hidden.',
  'cable.mic.deniedTry':
    'Allow the microphone for Clearly in your computer settings, then try again.',
  'cable.none':
    'No virtual cable found yet. Install one (step 1), then press Show my audio devices again.',
  'cable.detected': 'cable found',
  'cable.input': 'Input (the cable)',
  'cable.output': 'Output (your headphones)',
  'cable.same':
    'The input and output are the same device, which would feed the sound back into itself. Choose your headphones as the output.',
  'cable.test': 'Test the routing',
  'cable.test.running': 'Playing a short tone into the cable',
  'cable.test.ok': 'The cable works: the tone arrived.',
  'cable.test.failed':
    'The tone did not arrive within 2 seconds. Check that the cable is installed, then try again.',
  'cable.test.noOutput':
    'Clearly cannot find the other end of this cable, so it cannot test it. You can still press Start.',
  'cable.start': 'Start',
  'cable.startFailed':
    'Clearly could not listen to that device. Choose the cable again, or restart the computer after installing it.',
  'source.open': 'Open',
  'source.noTab.title': 'Enhancing other tabs is not available in this browser',
  'source.noTab.body':
    'This browser cannot share sound from another tab. You can use the Clearly desktop app, or open a file.',
  'source.phone.title': "Why can't I use Netflix or YouTube here?",
  'source.phone.body':
    'Phone browsers cannot listen to sound from other apps such as Netflix or YouTube. To enhance streaming video, use Clearly on a computer, or open a video file you own in Clearly on your phone.',
  'source.phone.more': 'Read about Clearly on phones',

  // Tab capture
  'tab.coach.title': 'Enhance a browser tab',
  'tab.coach.step1': 'Open your video in another tab.',
  'tab.coach.step2':
    'In the window that opens next, choose that tab and turn on "Also share tab audio".',
  'tab.coach.step3': 'Switch back to your video. Clearly keeps working in the background.',
  'tab.coach.dontShow': "Don't show this again",
  'tab.coach.continue': 'Choose the tab',
  'tab.noAudio': 'No sound was shared. Choose a tab and tick Also share tab audio.',
  'tab.failed': 'Clearly could not start sharing that tab.',
  'tab.failedTry': 'Try again, or open a file instead.',
  'tab.doubled.title': 'You may hear the sound twice',
  'tab.doubled.body':
    'This browser could not silence the original tab, so you may hear it and Clearly at the same time.',
  'tab.doubled.useFile': 'Use a local file instead',
  'tab.doubled.mute': 'Mute the original tab in the browser, then tell me if it still works',
  'tab.doubled.ask': 'Does it work with the original tab muted?',
  'tab.doubled.yes': 'Yes, it works',
  'tab.doubled.no': 'No',
  'tab.doubled.noBody':
    'Muting the tab also silenced Clearly here. A file or the desktop app will work better.',
  'tab.enhancing': 'Enhancing: {title}',
  'tab.yourTab': 'your tab',
  'tab.switchNow': 'Switch to your video now. Clearly keeps working in the background.',
  'tab.ended': 'Sharing stopped. Choose a tab again to carry on.',
  'engine.suspended':
    'Your device paused the sound, for example for a call or another app. Nothing is lost.',
  'engine.resume': 'Turn the sound back on',
  'device.lost.title': 'Clearly paused',
  'device.lost.body':
    'Your headphones or sound device changed. Clearly paused so nothing plays out loud from the speakers by surprise. Check your headphones, then press Play again.',
  'device.lost.play': 'Play again',
  // Desktop app capture (M12)
  'capture.switchNow': 'Play your video in any app. Clearly keeps working in the background.',
  'capture.ended': 'Clearly stopped listening to that sound.',
  'capture.again': 'Choose a sound again',
  'system.doubled.body':
    'Clearly hears all your computer sound, so you hear the original and Clearly together. The virtual cable sends the sound only through Clearly.',
  'system.doubled.cable': 'Set up the virtual cable',
  'tab.stop': 'Stop',

  // Player
  'player.title': 'Clear Audio',
  'player.back': 'Choose another source',
  'player.status.playing': 'Playing',
  'player.status.paused': 'Paused',
  'player.status.loading': 'Loading',
  'player.mode.legend': 'What you hear',
  'player.mode.original': 'Original',
  'player.mode.enhanced': 'Enhanced',
  'player.mode.simulate': 'Simulate my hearing',
  'player.mode.hint': 'Press Space to switch. Hold H to hear Original.',
  'player.mode.now': 'Now hearing: {mode}',
  'player.strength': 'Strength: {word} ({n} percent)',
  'player.preset.legend': 'Preset',
  'player.preset.movie': 'Movie',
  'player.preset.speech': 'Speech and news',
  'player.preset.music': 'Music',
  'player.preset.night': 'Night',
  'player.enhancements': 'Enhancements',
  'player.vf.title': 'Voice focus',
  'player.vf.body': 'Lifts voices in the middle of the sound and lowers sounds at the sides.',
  'player.vf.slider': 'Voice focus: {word} ({n} percent)',
  'player.vf.mono': 'This sound is mono, so Voice focus can only lift the speech range',
  'player.level.off': 'Off',
  'player.level.low': 'Low',
  'player.level.medium': 'Medium',
  'player.level.high': 'High',
  'player.overload': 'Clearly lowered the sound because it got too loud.',
  'player.resume': 'Resume',
  'player.unsupported':
    'This browser cannot play {format} files. Convert the file to MP4 or MP3, or use the Clearly desktop app.',
  'player.unsupportedUnknown': 'this kind of',
  'player.noProfileNote':
    'You are listening without a sound profile, so Enhanced only evens out loudness.',
  'player.estimated': 'Your profile is estimated from your age range.',

  // Transport
  'transport.play': 'Play',
  'transport.pause': 'Pause',
  'transport.back': 'Back 10 seconds',
  'transport.forward': 'Forward 10 seconds',
  'transport.seek': 'Position',
  'transport.time': '{now} of {total}',
  'transport.volume': 'Volume: {n} percent',
  'transport.speed': 'Speed: {n} times',
  'transport.keys': 'Keys: K play or pause, J back, L forward.',

  // See what Clearly is doing
  'insight.title': 'See what Clearly is doing',
  'insight.eq.title': 'How Clearly changes each pitch',
  'insight.eq.desc':
    'The line shows how much each pitch is raised or lowered for each ear. The shaded shape is the sound playing now.',
  'insight.eq.axisGain': 'Change (dB)',
  'insight.eq.ambient': 'Auto Boost',
  'insight.eq.spectrum': 'Sound now',
  'insight.eq.tableCaption': 'Change at each pitch, in dB',
  'insight.eq.colAmbient': 'Auto Boost (dB)',
  'insight.loudness': '{n} LUFS',
  'insight.loudnessQuiet': 'Quiet',
  'insight.compression': 'Lowering loud parts by {n} dB',
  'insight.limiter': 'Holding back {n} dB',
  'insight.metersCaption': 'Meter readings',
  'insight.row.loudness': 'Loudness',
  'insight.row.compression': 'Evening out loud and quiet',
  'insight.row.limiter': 'Loudest-sound limit',
  'insight.legend.right': 'Right ear: solid line',
  'insight.legend.left': 'Left ear: dashed line',
  'insight.legend.ambient': 'Auto Boost: dotted line',
  'insight.legend.spectrum': 'Sound now: shaded shape',

  // Advanced
  'advanced.title': 'Advanced',
  'advanced.bands': 'Adjust each pitch',
  'advanced.bandsHint': 'Add or remove up to 12 dB at a pitch, on top of your profile.',
  'advanced.band': '{ear}, {hz} Hz: {n} dB',
  'advanced.reset': 'Reset pitch adjustments',
  'advanced.loudest': 'Loudest-sound limit: {n} dBFS',
  'advanced.loudestHint': 'Sudden loud sounds are held below this level. Lower is quieter.',
  'advanced.output': 'Output device',
  'advanced.outputDefault': 'System default',
  'advanced.outputFailed': 'That device could not be used. Clearly is using the system default.',
  'advanced.perf': 'Worklet timing (development only)',

  // Export
  'export.open': 'Save enhanced copy',
  'export.title': 'Save an enhanced copy',
  'export.lead':
    'Clearly makes a new file with these settings built in. The original file is not changed.',
  'export.settings':
    'Built in: {preset} preset, strength {strength} percent, Voice focus {vf} percent, loudest-sound limit {limit} dBFS.',
  'export.format': 'Format',
  'export.wav': 'WAV (lossless, large)',
  'export.mp3': 'MP3 (smaller)',
  'export.mp3Note': 'MP3 is lossy: it is smaller but a little less exact than WAV.',
  'export.bitrate': 'MP3 quality',
  'export.kbps': '{n} kbps',
  'export.estimate': 'About {time} to make.',
  'export.estimating': 'Working out how long it will take',
  'export.start': 'Make the copy',
  'export.progress': 'Making your copy',
  'export.progressValue': '{done} of {total}',
  'export.cancel': 'Cancel',
  'export.cancelled': 'Cancelled. Nothing was saved.',
  'export.save': 'Save',
  'export.done': 'Saved as "{name}".',
  'export.ready': 'Your copy is ready.',
  'export.failed': 'The copy could not be made.',
  'export.failedTry': 'Try again, or try WAV instead of MP3.',
  'export.tooLong':
    'This file is longer than Clearly can save here ({max}). Choose a shorter file.',
  'export.tooBig':
    'The copy would be larger than 1 GB, which this browser cannot save in one go. Choose MP3 or a shorter file.',
  'export.noChunked':
    'This browser cannot read this file in pieces, and it is too long to read at once ({max} at most). Try a shorter file or another browser.',
  'export.close': 'Close',
  // Video export (M11)
  'export.video': 'Video with enhanced sound',
  'export.video.note':
    'The picture is copied exactly; only the sound changes. Saved as MP4, or as MKV when the video cannot go in MP4.',
  'export.video.phone':
    'Saving video is not available on phones, because it needs more memory than a phone browser allows. You can save the sound as WAV or MP3.',
  'export.video.tooBig':
    'Saving video works for files up to 1 GB, because of browser memory limits. You can save the sound as WAV or MP3 instead.',
  'export.video.download.lead':
    'Saving video needs a one-time download of the video tool ({size} MB). It is kept on this device for next time.',
  'export.video.download.action': 'Download the video tool ({size} MB)',
  'export.video.licence': 'The video tool is FFmpeg, free software under the LGPL.',
  'export.video.source': 'Its licence and source (opens in a new tab)',
  'export.video.metered': 'You seem to be on mobile data or data saver. Download {size} MB anyway?',
  'export.video.metered.yes': 'Download anyway',
  'export.video.metered.no': 'Not now',
  'export.video.downloading': 'Downloading the video tool',
  'export.video.downloadFailed':
    'The video tool could not be downloaded. Check your connection and try again, or save the sound as WAV or MP3.',
  'export.step.audio': 'Step 1 of 2: making the enhanced sound',
  'export.step.video': 'Step 2 of 2: putting the sound into the video',
  'export.video.dropped.one':
    '1 subtitle track could not go into this kind of file and was left out.',
  'export.video.dropped.many':
    '{n} subtitle tracks could not go into this kind of file and were left out.',
  'export.video.failed': 'The video could not be made.',
  'export.video.failedTry': 'You can still save the sound as WAV or MP3.',
  'export.video.unavailable':
    'The video tool could not start in this browser. You can still save the sound as WAV or MP3.',
  'export.video.noVideo': 'This file has no picture to keep. Save the sound as WAV or MP3 instead.',
  'export.video.useAudio': 'Save the sound instead',

  // Night mode (M06)
  'night.title': 'Night mode',
  'night.body':
    'Quieter voices are lifted and loud scenes are held down, so you can watch late without turning the volume up and down.',
  'night.level.legend': 'How much',
  'night.level.low': 'Light',
  'night.level.medium': 'Medium',
  'night.level.high': 'Strong',
  'night.schedule': 'Turn on automatically',
  'night.scheduleTime': 'Time to turn on',
  'night.scheduleNote': 'This works only while Clearly is open.',
  'night.scheduled': 'Night mode turned on at {time}.',

  // Background cleanup (M06)
  'cleanup.title': 'Background cleanup',
  'cleanup.body':
    'Reduces steady background noise behind voices. Works best on speech in noise and can make music sound thin, which is why the Music preset turns it off.',
  'cleanup.slider': 'Background cleanup: {word} ({n} percent)',
  'cleanup.download.lead':
    'Background cleanup needs a one-time download of {size} MB. It then works offline.',
  'cleanup.download.action': 'Download {size} MB',
  'cleanup.metered': 'You seem to be on mobile data or data saver. Download {size} MB anyway?',
  'cleanup.metered.yes': 'Download anyway',
  'cleanup.metered.no': 'Not now',
  'cleanup.downloading': 'Downloading Background cleanup',
  'cleanup.failed.title': 'Background cleanup could not be downloaded',
  'cleanup.failed.body': 'The download did not finish, or the file was damaged on the way.',
  'cleanup.failed.try':
    'Check your connection and try again. Everything else in Clear Audio still works.',
  'cleanup.rate':
    'Background cleanup needs sound at 48,000 Hz, and this output runs at {rate} Hz, so it is off here. Everything else still works.',
  'cleanup.voice.yes': 'Voice detected',
  'cleanup.voice.no': 'No voice right now',
  'cleanup.hint': 'Try Background cleanup',
  'cleanup.hintBody': 'Your speech-in-noise result suggests it may help.',
  'cleanup.hintDismiss': 'Dismiss',
  'cleanup.remove': 'Remove downloaded Background cleanup file',
  'cleanup.removed': 'Removed. You can download it again at any time.',

  // Captions (M07)
  'captions.title': 'Captions',
  'captions.body': 'Shows the words being said, made on this device. English only for now.',
  'captions.mode.legend': 'Captions',
  'captions.mode.off': 'Off',
  'captions.mode.video': 'On for this video',
  'captions.mode.always': 'Always on',
  'captions.model': 'Caption quality',
  'captions.model.standard': 'Standard',
  'captions.model.accurate': 'More accurate',
  'captions.model.option': '{name} ({mb} MB)',
  'captions.model.hint':
    'English only for now. More accurate needs a bigger download and a faster computer.',
  'captions.download.lead':
    'Captions need a one-time download of about {standard} MB (Standard) or {accurate} MB (More accurate). They then work offline.',
  'captions.download.action': 'Download {size} MB',
  'captions.metered': 'You seem to be on mobile data or data saver. Download {size} MB anyway?',
  'captions.downloading': 'Downloading captions',
  'captions.loading': 'Getting captions ready',
  'captions.failed.title': 'Captions could not be downloaded',
  'captions.failed.body': 'The download did not finish, or a file was damaged on the way.',
  'captions.failed.try': 'Check your connection and try again. Everything else still works.',
  'captions.error.title': 'Captions stopped',
  'captions.error.body': 'Something went wrong while making captions.',
  'captions.error.try': 'Try turning captions off and on again.',
  'captions.progress': 'Captions ready for {ready} of {total}',
  'captions.complete': 'Captions are ready for the whole file.',
  'captions.first': 'Captions first',
  'captions.firstHint': 'Waits until captions are 10 seconds ahead before playing.',
  'captions.waiting': 'Waiting for captions to get ahead. Playback starts by itself.',
  'captions.liveFallback':
    'This file cannot be read ahead here, so captions are made as it plays and may lag a little.',
  'captions.liveLag': 'Live captions lag a few seconds behind the picture.',
  'captions.skipped': 'Captions skipped ahead to keep up.',
  'captions.save': 'Save captions',
  'captions.saveSrt': 'Save as SRT',
  'captions.saveVtt': 'Save as WebVTT',
  'captions.float': 'Open floating captions',
  'captions.floatClose': 'Close floating captions',
  'captions.floatHint':
    'A small window that stays on top of other windows. Press Escape to close it.',
  'captions.floatTitle': 'Clearly captions',
  'captions.panel': 'Captions',
  'captions.none': 'No words yet.',
  'captions.display': 'Caption appearance',
  'captions.size': 'Text size: {n} pixels',
  'captions.lines': 'Lines shown: {n}',
  'captions.scheme': 'Colours',
  'captions.scheme.white': 'White on black',
  'captions.scheme.yellow': 'Yellow on black',
  'captions.scheme.dark': 'Black on white',
  'settings.downloads': 'Downloads',
  'captions.remove': 'Remove downloaded captions files',
  'captions.removed': 'Caption files removed. You can download them again at any time.',
  'captions.device.webgpu': 'Using the graphics processor.',
  'captions.device.wasm': 'Using the main processor.',

  // Listening Health (M08)
  'nav.health': 'Listening Health',
  'health.title': 'Listening Health',
  'health.lead': 'Three ways to keep an eye on how you hear and how loudly you listen.',
  'health.sin.title': 'Speech in noise',
  'health.sin.purpose': 'How well you follow speech when there is background noise.',
  'health.sin.start': 'Start the check (about {n} seconds)',
  'health.sin.last': 'Last result: {result} ({date})',
  'health.sin.none': 'Not done yet.',
  'health.track.title': 'Safe listening',
  'health.track.purpose': 'How long you listen at loud levels each day.',
  'health.hist.title': 'Hearing Check history',
  'health.hist.purpose': 'Every check you have done, so you can compare them over time.',
  'health.hist.none': 'No results yet.',

  // Speech-in-noise check
  'sin.title': 'Speech-in-noise check',
  'sin.intro':
    'You will hear three numbers spoken over a rushing noise. Type the three numbers you heard. If you are not sure, guess or press Not sure. It takes about 90 seconds.',
  'sin.headphones': 'Keep your headphones on and your volume where you set it.',
  'sin.start': 'Start',
  'sin.skip': 'Skip',
  'sin.needCal.title': 'Set a comfortable level first',
  'sin.needCal.body':
    'The noise is set from your comfortable level, so Clearly needs it before this check.',
  'sin.needCal.action': 'Set a comfortable level',
  'sin.noDigits.title': 'This check is not available yet',
  'sin.noDigits.body':
    'The spoken numbers for this check have not been installed in this version of Clearly. Everything else works.',
  'sin.listen': 'Listen',
  'sin.typeNow': 'Type the three numbers you heard.',
  'sin.pad': 'Number pad',
  'sin.notSure': 'Not sure',
  'sin.backspace': 'Delete last',
  'sin.entered': 'You entered: {digits}',
  'sin.progress': 'Progress',
  'sin.progressValue': '{done} of {total}',
  'sin.keys': 'You can type the numbers on your keyboard too.',
  'sin.result.title': 'Your speech-in-noise result',
  'sin.result.good': 'In background noise you followed speech well.',
  'sin.result.some': 'In background noise you followed speech with some effort.',
  'sin.result.considerable': 'In background noise you followed speech with a lot of effort.',
  'sin.result.note':
    'This is a rough guide made with your headphones at your volume. It is not a measurement of your hearing.',
  'sin.result.apply': 'Apply suggested settings',
  'sin.result.applyDone': 'Done. Voice focus and Background cleanup are now part of your sound.',
  'sin.result.captions': 'Captions can help too. Turn them on in Clear Audio.',
  'sin.result.professional':
    'If following speech in noise is often hard, a hearing check with an audiologist could help.',
  'sin.result.back': 'Back to Listening Health',
  'sin.category.good': 'Good',
  'sin.category.some': 'Some difficulty',
  'sin.category.considerable': 'Considerable difficulty',

  // Safe-listening tracker
  'track.honest':
    "This is a guide based on your own comfortable level, not a measurement of sound pressure. If you change your computer's volume, it becomes less accurate.",
  'track.noCal':
    'The tracker is off because Clearly does not know your comfortable level yet. Set it in the Hearing Check.',
  'track.today': 'Today',
  'track.zone.comfortable': 'Comfortable',
  'track.zone.loud': 'Loud',
  'track.zone.veryLoud': 'Very loud',
  'track.minutes': '{n} min',
  'track.todayLabel': 'Today: {comfortable} minutes comfortable, {loud} loud, {veryLoud} very loud',
  'track.week': 'The last seven days',
  'track.weekDesc': 'Minutes of listening each day, split into comfortable, loud and very loud.',
  'track.colDay': 'Day',
  'track.alert': 'Remind me after {n} minutes of very loud listening in a day',
  'track.alertToast': 'You have listened very loudly for {n} minutes today.',
  'track.alertAction': 'Lower the loudest sound limit by 6 dB',
  'track.alertDone': 'The loudest sound limit is now {n} dBFS.',
  'track.pause': 'Pause the tracker',
  'track.clear': 'Clear listening history',
  'track.cleared': 'Listening history cleared.',
  'track.empty': 'No listening recorded yet.',

  // History and reminders
  'hist.compare': 'Compare',
  'hist.compareHint': 'Choose two Hearing Checks to see them on one chart.',
  'hist.select': 'Select {date}',
  'hist.compareTitle': 'Two Hearing Checks compared',
  'hist.compareNote':
    'Differences can come from your headphones or volume, not only your hearing. If you see a steady decline over time, talk to an audiologist.',
  'hist.differentHeadphones':
    'These two checks used different headphones ({a} and {b}), which can change the results.',
  'hist.earlier': 'Earlier ({date})',
  'hist.later': 'Later ({date})',
  'hist.legend': '{later}: red circles and blue crosses. {earlier}: grey.',
  'hist.item': '{method}, {date}, {headphones}',
  'hist.reliability': 'Consistency: {level}',
  'hist.sinItem': 'Speech in noise, {date}: {result}',
  'reminder.check.setting': 'Remind me to check my hearing',
  'reminder.check.off': 'Never',
  'reminder.check.months': 'Every {n} months',
  'reminder.check.notify': 'Also show a notification',
  'reminder.check.notifyHint':
    'Only while Clearly is open, because Clearly does not use a server to send reminders.',
  'reminder.check.notifyDenied': 'Notifications are blocked for Clearly in this browser.',
  'reminder.check.title': 'Time for a Hearing Check',
  'reminder.check.body':
    'Your last Hearing Check was a while ago. Checking again keeps your sound up to date.',
  'reminder.check.action': 'Check my hearing',

  // Quiet Lab (M09)
  'nav.quiet': 'Quiet Lab',
  'quiet.title': 'Quiet Lab',
  'quiet.lead':
    'Three tools for steady noise and quiet moments. Each one says what it does and what it cannot do.',
  'quiet.whatDoes': 'What does this do?',
  'quiet.close': 'Close',
  'quiet.hum.title': 'Hum Filter',
  'quiet.hum.does': 'Removes steady humming or buzzing that is part of the video or recording.',
  'quiet.hum.cannot': 'It does not remove noise in your room.',
  'quiet.hum.more':
    'Old recordings and poor cables can add a low hum at 50 or 60 cycles a second, the speed of mains electricity. Hum Filter finds that hum and its overtones and removes only those narrow pitches, so voices sound the same. Use it in Clear Audio with files, tabs or the demo.',
  'quiet.hum.open': 'Use it in Clear Audio',
  'quiet.auto.title': 'Auto Boost',
  'quiet.auto.does':
    'Makes voices a little clearer when your room gets noisy, using your microphone to hear the room.',
  'quiet.auto.cannot': 'It cannot block out room noise, and it needs headphones.',
  'quiet.auto.more':
    'Auto Boost checks how loud your room is a few times a second. When it gets noisier, it lifts the pitches that carry speech by up to 6 dB and evens out loud and quiet parts. Nothing is recorded or sent anywhere.',
  'quiet.auto.open': 'Set up Auto Boost',
  'quiet.calm.title': 'Calm Sounds',
  'quiet.calm.does':
    'Plays soft, steady sounds such as rain or ocean that can make background ringing easier to live with.',
  'quiet.calm.cannot': 'It is not a treatment and does not change your hearing.',
  'quiet.calm.more':
    'Calm Sounds makes its sounds on your device, so nothing downloads. You can match a sound to the pitch of your background ringing and set a sleep timer. The volume never goes above a gentle limit based on your Hearing Check volume setting.',
  'quiet.calm.open': 'Open Calm Sounds',

  // Hum Filter card in Clear Audio
  'hum.title': 'Hum Filter',
  'hum.body':
    'Removes steady humming or buzzing that is part of the video or recording. It does not remove noise in your room.',
  'hum.mode.legend': 'Hum Filter setting',
  'hum.mode.off': 'Off',
  'hum.mode.auto': 'Auto',
  'hum.mode.50': '50 Hz',
  'hum.mode.60': '60 Hz',
  'hum.readout': 'Removing hum at {hz} Hz and {n} harmonics',
  'hum.readoutOne': 'Removing hum at {hz} Hz',
  'hum.listening': 'Listening for hum. Once sound is playing, this takes a few seconds.',
  'hum.none': 'No steady hum found so far.',
  'hum.offNote': 'Hum Filter is off.',
  'hum.demo': 'Hear the demo with hum',
  'hum.demoNote': 'The demo clip with a 60 Hz hum added, so you can hear the filter work.',

  // Auto Boost
  'auto.title': 'Auto Boost',
  'auto.lead':
    'When your room gets noisier, Auto Boost makes voices a little clearer. It listens to the room through your microphone.',
  'auto.honest':
    'Auto Boost estimates how noisy your room is. It is a helpful guide, not a calibrated measurement.',
  'auto.onlyPlaying': 'Auto Boost works only while Clear Audio is playing.',
  'auto.openPlayer': 'Go to Clear Audio',
  'auto.headphones.title': 'Wear headphones for Auto Boost',
  'auto.headphones.body':
    'Auto Boost listens to your room. With speakers, it would hear your show and keep turning itself up.',
  'auto.headphones.yes': "I'm wearing headphones",
  'auto.headphones.no': 'Not now',
  'auto.headphones.info': 'Why headphones?',
  'auto.mic.title': 'Why Clearly needs your microphone',
  'auto.mic.body':
    'It listens to the room only to measure how noisy it is. Nothing is recorded or sent anywhere.',
  'auto.mic.continue': 'Allow the microphone',
  'auto.mic.cancel': 'Not now',
  'auto.denied.title': 'The microphone is blocked',
  'auto.denied.body': 'Your browser said no to the microphone, so Auto Boost cannot hear the room.',
  'auto.denied.try':
    "To allow it, open this site's settings in your browser. The icon next to the web address often opens them. Set Microphone to Allow. Then try again.",
  'auto.noMic':
    'No microphone was found. Connect one, or use a built-in microphone, then try again.',
  'auto.unavailable':
    'This browser cannot use a microphone, so Auto Boost is not available here. Clear Audio still works as usual.',
  'auto.start': 'Turn on Auto Boost',
  'auto.stop': 'Turn off Auto Boost',
  'auto.tryAgain': 'Try again',
  'auto.room': 'How noisy your room sounds: {word}',
  'auto.meterLabel': 'Room level',
  'auto.word.quiet': 'Quiet',
  'auto.word.some': 'A little noisy',
  'auto.word.noisy': 'Noisy',
  'auto.word.very': 'Very noisy',
  'auto.adding': 'Currently adding +{n} dB',
  'auto.sensitivity': 'Sensitivity',
  'auto.sensitivity.low': 'Low',
  'auto.sensitivity.medium': 'Medium',
  'auto.sensitivity.high': 'High',
  'auto.sensitivity.hint': 'High reacts to quieter rooms. Low waits for louder ones.',
  'auto.paused': 'Auto Boost paused: it can hear your show. Are you using speakers?',
  'auto.resume': 'I am on headphones now, resume',
  'auto.waiting': 'Auto Boost is on and waiting for Clear Audio to play.',
  'auto.on': 'Auto Boost is on.',
  'auto.card.body':
    'Lifts voices a little when your room gets noisy. It uses your microphone and needs headphones.',
  'auto.card.setup': 'Set up Auto Boost',
  'auto.card.settings': 'Auto Boost settings',

  // Calm Sounds
  'calm.title': 'Calm Sounds',
  'calm.lead':
    'Soft, steady sounds made on your device. They work with any headphones or speakers.',
  'calm.required':
    'Sound can make background ringing easier to live with, but it is not a treatment. See a doctor if ringing is in one ear only, comes with hearing loss or dizziness, or beats with your heartbeat.',
  'calm.kind.legend': 'Sound',
  'calm.kind.white': 'White noise',
  'calm.kind.pink': 'Pink noise',
  'calm.kind.brown': 'Brown noise',
  'calm.kind.rain': 'Rain',
  'calm.kind.ocean': 'Ocean',
  'calm.kind.tailored': 'Matched to my ringing',
  'calm.kind.tailoredNeedsPitch': 'Match your background ringing below to use this sound.',
  'calm.play': 'Play',
  'calm.stop': 'Stop',
  'calm.playing': 'Playing {sound}.',
  'calm.stopped': 'Stopped.',
  'calm.volume': 'Volume: {word}',
  'calm.volume.verySoft': 'Very soft',
  'calm.volume.soft': 'Soft',
  'calm.volume.medium': 'Medium',
  'calm.volume.full': 'Fullest allowed',
  'calm.capNote':
    'The loudest setting stays 10 dB below your comfortable level from the Hearing Check.',
  'calm.capNoteNoCal':
    'The loudest setting is kept low because this profile has no Hearing Check volume setting yet.',
  'calm.timer.legend': 'Sleep timer',
  'calm.timer.15': '15 min',
  'calm.timer.30': '30 min',
  'calm.timer.60': '60 min',
  'calm.timer.90': '90 min',
  'calm.timer.night': 'All night',
  'calm.timer.left': 'Stops in {time}, fading out over the last minute.',
  'calm.timer.allNight': 'Plays until you press Stop.',
  'calm.timer.done': 'The sleep timer stopped the sound.',
  'calm.phone':
    'On phones and tablets, sound may pause when the screen locks. Keep the screen on and leave Clearly open.',
  'calm.pitch.title': 'Match your background ringing',
  'calm.pitch.lead':
    'If you hear a background ringing, you can match its pitch. Calm Sounds can then play a sound shaped around it.',
  'calm.pitch.start': 'Start matching',
  'calm.pitch.redo': 'Match again',
  'calm.pitch.saved': 'Your matched pitch: about {hz} Hz.',
  'calm.pitch.step': 'A soft tone is playing. Is your background ringing higher or lower than it?',
  'calm.pitch.now': 'Tone: about {hz} Hz',
  'calm.pitch.higher': 'Higher',
  'calm.pitch.lower': 'Lower',
  'calm.pitch.close': 'This is close',
  'calm.pitch.octave': 'One more check. Listen to both tones. Which is closer to your ringing?',
  'calm.pitch.playLow': 'Play tone 1',
  'calm.pitch.playHigh': 'Play tone 2',
  'calm.pitch.pickLow': 'Tone 1',
  'calm.pitch.pickHigh': 'Tone 2',
  'calm.pitch.pickNeither': 'Neither, keep {hz} Hz',
  'calm.pitch.cancel': 'Cancel',
  'calm.pitch.done': 'Saved. Choose Matched to my ringing above to play it.',
  'calm.pitch.noProfile': 'Make a sound profile first, then you can save a matched pitch.',

  // Navigation, More, PWA, appearance, first run and Home (M10)
  'nav.more': 'More',
  'nav.profileSettings': 'Profile and Settings',
  'nav.everywhere': 'Get Clearly Everywhere',
  'nav.privacy': 'About and privacy',
  'nav.feedback': 'Send feedback',
  'more.title': 'More',
  'more.lead': 'Your listening health, profiles and settings, and Clearly on your other devices.',
  'more.health':
    'Check how well you hear speech in noise. See how loud you listen, and your past results.',
  'more.settings': 'Your profiles and sound. Colours, storage, backup and downloads.',
  'more.everywhere': 'Clearly on a computer, in Chrome, and on your phone.',
  'more.privacy': 'What Clearly stores, where, and for how long.',
  'more.feedback': 'Tell us what works and what does not.',
  'everywhere.title': 'Get Clearly Everywhere',
  'everywhere.lead': 'Clearly works in this browser now. Here is how to use it in other places.',
  'everywhere.phone.title': 'On your phone or tablet',
  'everywhere.phone.body':
    'Open Clearly in your phone browser and add it to your home screen. It then opens like an app and works without a connection, except for downloads and backup.',
  'everywhere.qr.lead': 'Point your phone camera at the code, or type this address:',
  'everywhere.qr.alt': 'QR code for {url}',
  'everywhere.qr.local':
    'This is a development address. Your phone must reach this computer (the same Wi-Fi, or a tunnel), and the microphone works only over HTTPS.',
  'everywhere.iphone.title': 'iPhone and iPad',
  'everywhere.iphone.1': 'Open the address in Safari.',
  'everywhere.iphone.2': 'Tap the Share button.',
  'everywhere.iphone.3': 'Tap Add to Home Screen.',
  'everywhere.iphone.4': 'Open Clearly from your Home Screen.',
  'everywhere.iphone.5': 'Run Quick start.',
  'everywhere.android.title': 'Android',
  'everywhere.android.1': 'Open the address in Chrome.',
  'everywhere.android.2': 'Tap the menu (three dots).',
  'everywhere.android.3': 'Tap Install app or Add to Home screen.',
  'everywhere.android.4': 'Open Clearly.',
  'everywhere.android.5': 'Run Quick start.',
  'everywhere.menusVary': 'Menu names vary between versions.',
  'everywhere.works.title': 'What works on a phone',
  'everywhere.works.yes': 'Yes:',
  'everywhere.works.no': 'No:',
  'everywhere.works.check': 'Hearing Check.',
  'everywhere.works.files': 'Clear Audio with your files and the demo clip.',
  'everywhere.works.calm':
    'Calm Sounds. On some phones the sound pauses when the screen locks, so keep the screen on.',
  'everywhere.works.captions': 'Captions on your files, after a download on Wi-Fi.',
  'everywhere.works.hum': 'Hum Filter on your files.',
  'everywhere.works.auto': 'Auto Boost while something plays, with headphones.',
  'everywhere.works.tab':
    'Browser tab sound. Phone browsers cannot listen to sound from other apps such as Netflix or YouTube.',
  'everywhere.workaround':
    'To enhance streaming video, use Clearly on a computer, or open a video file you own in Clearly on your phone.',
  'everywhere.builtin.title': 'Your phone may have its own sound settings',
  'everywhere.builtin.body': 'Many phones can adjust headphone sound for all apps. Look for these:',
  'everywhere.builtin.iphone':
    'iPhone: Settings, Accessibility, Audio and Visual, Headphone Accommodations.',
  'everywhere.builtin.android':
    'Android: Settings, Accessibility, then hearing options or the Sound Amplifier app.',
  'everywhere.desktop.title': 'Desktop app',
  'everywhere.desktop.body':
    'For Windows, Mac and Linux. It can improve the sound of any app on your computer, through a virtual cable (all three) or directly (Windows).',
  'everywhere.desktop.download': 'Download the desktop app (opens your browser)',
  'everywhere.desktop.notYet': 'The download link appears here when it is published.',
  'everywhere.desktop.mac':
    'Mac: open the downloaded file and drag Clearly to Applications. The first time, if your Mac says it cannot check the app, open System Settings, Privacy and Security, and choose Open Anyway.',
  'everywhere.desktop.windows':
    'Windows: run the installer. If a blue box says Windows protected your PC, choose More info, then Run anyway.',
  'everywhere.desktop.linux': 'Linux: allow the AppImage file to run as a program, then open it.',
  'pwa.offline': 'You are offline. Everything works except downloads and backup.',
  'pwa.update': 'A new version is ready.',
  'pwa.reload': 'Reload',
  'pwa.later': 'Later',
  'pwa.install.title': 'Add Clearly to this device',
  'pwa.install.body':
    'Clearly can open like an app, from your home screen or dock, and work without a connection.',
  'pwa.install.yes': 'Add Clearly',
  'pwa.install.no': 'Not now',
  'pwa.install.manual':
    "To add Clearly to your home screen, press your browser's Share button, then Add to Home Screen.",
  'pwa.install.gotIt': 'Got it',
  'appearance.title': 'Appearance',
  'appearance.legend': 'Colours',
  'appearance.system': 'Match my device',
  'appearance.light': 'Light',
  'appearance.dark': 'Dark',
  'appearance.contrast': 'High contrast',
  'appearance.hint':
    'High contrast uses the strongest colours. Your device setting for reduced motion is always followed.',
  'welcome.title': 'Welcome to Clearly',
  'welcome.stepper': 'Step {n} of {total}',
  'welcome.step.welcome': 'Welcome',
  'welcome.step.start': 'How to start',
  'welcome.step.hear': 'Hear it',
  'welcome.step.watch': 'How you watch',
  'welcome.body1':
    'Clearly makes dialogue in TV, films and videos easier to follow with your own headphones.',
  'welcome.body2': 'It tunes the sound to how you hear, in about a minute.',
  'welcome.next': 'Next',
  'welcome.continueSetup': 'Continue setting up Clearly',
  'welcome.skip': 'Skip for now',
  'welcome.back': 'Back',
  'welcome.restore': 'I have a restore code',
  'welcome.start.title': 'Choose how to start',
  'welcome.start.quick': 'Quick start (5 seconds): pick your age',
  'welcome.start.quickHint': 'A gentle starting sound based on typical hearing for your age.',
  'welcome.start.measure': 'Measure my hearing (about {n} seconds)',
  'welcome.start.measureHint':
    'Short beeps at different pitches, with headphones or your computer speakers.',
  'welcome.start.done': 'Your sound is ready.',
  'welcome.hear.title': 'Hear the difference',
  'welcome.hear.question': 'Which sounds clearer?',
  'welcome.hear.play': 'Play the demo',
  'welcome.hear.pause': 'Pause',
  'welcome.hear.fineTune': 'Fine-tune my sound',
  'welcome.hear.continue': 'Continue',
  'welcome.hear.needProfile': 'Choose how to start first, then you can hear the difference here.',
  'welcome.watch.title': 'Choose how you will watch',
  'welcome.watch.tab': 'A browser tab',
  'welcome.watch.tabBody': 'YouTube, streaming sites and other tabs in this browser.',
  'welcome.watch.tabNone':
    'This browser cannot share a tab with sound. Use a file, or Chrome or Edge on a computer.',
  'welcome.watch.file': 'A file on this device',
  'welcome.watch.fileBody': 'Videos and recordings you have saved.',
  'welcome.watch.desktop': 'Desktop app',
  'welcome.watch.desktopBody': 'For sound from any app on your computer.',
  'welcome.watch.phone': 'Phone',
  'welcome.watch.phoneBody': 'Add Clearly to your phone for files and the demo.',
  'welcome.watch.choose': 'Choose',
  'welcome.watch.finish': 'Finish and go to Home',
  'home.dash.title': 'Your sound is ready',
  'home.aboutSeconds': 'about {n} seconds',
  'home.new.title': 'Clearer dialogue with your own headphones',
  'home.new.lead':
    'Set up sound that fits your hearing in about a minute, then use it on any video.',
  'home.new.cta': 'Set up my sound',
  'home.startAudio': 'Start Clear Audio',
  'home.resumeTab': 'Enhance a tab again',
  'home.resumeDemo': 'Continue with the demo',
  'home.startAudioHint': 'Choose a tab, a file or the demo, and hear it with your sound.',
  'home.suggest.title': 'Suggested next',
  'home.suggest.estimated': 'Your sound is based on your age. A short check makes it fit you.',
  'home.suggest.estimatedAction': 'Make it more accurate',
  'home.suggest.sin':
    'Find out how well you follow speech in background noise. It takes about 90 seconds.',
  'home.suggest.sinAction': 'Try the speech-in-noise check',
  'home.suggest.old': 'Your last Hearing Check was more than 6 months ago.',
  'home.suggest.oldAction': 'Check again',
  'home.suggest.backup':
    'Your settings are only on this device. Save a backup file or a restore code.',
  'home.suggest.backupAction': 'Back up my settings',
  'example.play': 'Hear an example',
  'example.stop': 'Stop the example',
  'example.off': 'Playing: without {feature}',
  'example.on': 'Playing: with {feature}',
  'example.done': 'Example finished.',
  'example.note': '8 seconds without, then 8 seconds with.',
  'example.vf': 'Voice focus',
  'example.night': 'Night mode',
  'example.hum': 'Hum Filter',
  'example.failed': 'The example could not play.',

  // Hearing Check results (added in M01 for later screens; listed in docs/REGULATORY_REVIEW.txt).
  'hearingCheck.results.refNote':
    'We compare each pitch with how your better ear heard the middle pitch, 1,000 Hz. This works well when hearing has changed with age, but not for everyone.',
  'hearingCheck.results.estimatedBand': 'Estimated between measured points',
} as const;

export type MessageId = keyof typeof en;

export type CopyVars = Readonly<Record<string, string | number>>;

/** The string for a message id, with {placeholders} filled from vars. */
export function t(id: MessageId, vars?: CopyVars): string {
  const s: string = en[id];
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const v = vars[key];
    return v === undefined ? whole : String(v);
  });
}
