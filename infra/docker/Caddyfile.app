# El Caddy de dentro del contenedor: solo sirve ficheros. HTTPS, dominio y
# cabeceras de seguridad los pone el Caddy de Peer4U (infra/caddy/webar.caddy).
{
	admin off
	auto_https off
}

:8080 {
	encode zstd gzip

	# La salud que miran la CI y deploy.sh: tiene que llevar el commit.
	handle /health {
		header Content-Type "application/json"
		header Cache-Control "no-store"
		respond `{"ok":true,"version":"{$GIT_SHA}"}` 200
	}

	handle {
		root * /srv
		file_server
	}
}
