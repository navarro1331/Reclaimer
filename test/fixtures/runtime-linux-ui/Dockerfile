FROM node:24.14.1-bookworm-slim@sha256:b506e7321f176aae77317f99d67a24b272c1f09f1d10f1761f2773447d8da26c
LABEL reclaimer.owned-proof="six-area-linux-ui-20261016"
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-gi python3-pyatspi gir1.2-gtk-3.0 dbus-x11 at-spi2-core xvfb xauth && rm -rf /var/lib/apt/lists/*
RUN apt-get update && apt-get install -y --no-install-recommends python3-xlib && rm -rf /var/lib/apt/lists/*
USER 1000:1000
WORKDIR /proof
