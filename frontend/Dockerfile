# # Build Angular app
# FROM node:18 AS build
# WORKDIR /app
# COPY package*.json ./
# RUN npm install
# COPY . .
# RUN npm run build

# FROM node:18-alpine

# WORKDIR /app

# COPY package*.json ./

# RUN npm config set fetch-retries 5 \
#  && npm config set fetch-retry-mintimeout 20000 \
#  && npm config set fetch-retry-maxtimeout 120000 \
#  && npm ci --no-audit --no-fund

# COPY . .
# RUN npm run build

# # Serve using nginx
# FROM nginx:alpine
# COPY --from=build /app/dist/* /usr/share/nginx/html
# ---------- Build stage ----------
FROM node:18-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ---------- Production stage ----------
# FROM nginx:alpine

# # Angular dist folder name matters here
# COPY --from=build /app/dist /usr/share/nginx/html

# EXPOSE 80

# CMD ["nginx", "-g", "daemon off;"]
FROM nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy our custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy Angular build output
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
