class_name BuildInfo

## What this build is, for showing to a player who has to report a problem with it.

## Shown when nothing stamped a version in, which is every run from the editor and every
## local export. Deliberately not a number: a stale version read confidently is worse
## than an obvious absence, because it is the one the player would quote back.
const UNSTAMPED := "dev"


## The client's own version. Written into `application/config/version` at export time
## from the manifest, so there is no copy of it in the repo to fall behind the MDX.
static func version() -> String:
	var stamped: String = str(ProjectSettings.get_setting("application/config/version", ""))
	return stamped if stamped != "" else UNSTAMPED


## The wire version this build speaks.
static func protocol() -> int:
	return QNetClient3D.protocol_version()
