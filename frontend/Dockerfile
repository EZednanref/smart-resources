FROM nginx:alpine

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY index.html      /usr/share/nginx/html/
COPY register.html   /usr/share/nginx/html/
COPY dashboard.html  /usr/share/nginx/html/
COPY css/            /usr/share/nginx/html/css/
COPY js/             /usr/share/nginx/html/js/
