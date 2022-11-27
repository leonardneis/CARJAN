FROM node:8.6-alpine

RUN apk update && apk add git && apk add supervisor
RUN mkdir app

ADD . app/

RUN cd app && npm install

EXPOSE 4200/tcp
EXPOSE 4201/tcp
EXPOSE 4202/tcp

WORKDIR app/

ENTRYPOINT ["/bin/sh", "/app/docker/startup.sh"]
