FROM postgres:latest

RUN apt-get clean && apt-get update && \
    apt-get install -y postgresql-contrib

COPY init.sql /docker-entrypoint-initdb.d/
COPY install-uuid.sql /docker-entrypoint-initdb.d/
