class_name BuildInfo


const UNSTAMPED := "dev"


static func version() -> String:
	var stamped: String = str(ProjectSettings.get_setting("application/config/version", ""))
	return stamped if stamped != "" else UNSTAMPED


static func protocol() -> int:
	return QNetClient3D.protocol_version()
