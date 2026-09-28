FROM node:24-bookworm-slim
RUN mkdir -p /opt/next /opt/vite && cd /opt/next && npm init -y && npm install --ignore-scripts next@15.0.3 react@19.0.0 react-dom@19.0.0 typescript@5.6.3 @types/node@22.9.0 @types/react@19.0.0 @types/react-dom@19.0.0 tailwindcss@3.4.14 postcss@8.4.47 autoprefixer@10.4.20 && cd /opt/vite && npm init -y && npm install --ignore-scripts vite@5.4.0 @vitejs/plugin-react@4.3.1 react@18.3.1 react-dom@18.3.1 react-router-dom@6.26.2 && npm cache clean --force
COPY packages/validation/preview-entrypoint.sh /usr/local/bin/preview-entrypoint
RUN chmod 755 /usr/local/bin/preview-entrypoint
USER node
ENTRYPOINT ["/usr/local/bin/preview-entrypoint"]