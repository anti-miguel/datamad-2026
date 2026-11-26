#!/bin/sh
# Compila la web y la sube al EVO-T1, donde la sirve el contenedor yavoy-web (servidor/web_estatica.py)
# comprimida y con caché. El enlace público (Tailscale Funnel, ruta secreta del QR) apunta a ese contenedor.
# Uso, desde la carpeta app/: sh servidor/desplegar.sh
# Necesita los alias SSH evo-services (VM del EVO) del equipo de Miguel. La clave de CARTO va en web/.env.local.
set -e
cd web
npm run build
cd ..
python servidor/web_estatica.py --comprimir web/dist
tar -C web -czf /tmp/yavoy-dist.tgz dist
scp -q /tmp/yavoy-dist.tgz evo-services:/tmp/yavoy-dist.tgz
ssh evo-services 'set -e
  sudo mkdir -p /srv/evo/yavoy-web/nuevo
  sudo tar -C /srv/evo/yavoy-web/nuevo -xzf /tmp/yavoy-dist.tgz
  sudo chmod -R a+rX /srv/evo/yavoy-web/nuevo
  # cambio de golpe: primero se copia todo y luego se sustituye, para no dejar la web a medias
  sudo rm -rf /srv/evo/yavoy-web/anterior
  sudo mv /srv/evo/yavoy-web/dist /srv/evo/yavoy-web/anterior
  sudo mv /srv/evo/yavoy-web/nuevo/dist /srv/evo/yavoy-web/dist
  sudo rmdir /srv/evo/yavoy-web/nuevo
  sudo docker restart yavoy-web >/dev/null
  rm /tmp/yavoy-dist.tgz
  echo "desplegado"'
rm /tmp/yavoy-dist.tgz
