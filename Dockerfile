FROM node:20 AS dlc-solidity-build

COPY ./contracts /app/dlc-solidity/contracts
COPY ./scripts /app/dlc-solidity/scripts
COPY ./test /app/dlc-solidity/test
COPY ./package.json /app/dlc-solidity/package.json
COPY ./package-lock.json /app/dlc-solidity/package-lock.json
COPY ./docker/hardhat.config.docker.js /app/dlc-solidity/hardhat.config.js

WORKDIR /app/dlc-solidity

RUN npm ci

RUN npx hardhat compile

FROM node:20-alpine

COPY --from=dlc-solidity-build /app/dlc-solidity /app/dlc-solidity

WORKDIR /app/dlc-solidity

RUN npm link

RUN echo "HARDHAT_NETWORK=localhost" >> /app/dlc-solidity/.env

COPY ./docker/scripts/check-service.sh /check-service.sh
RUN chmod +x /check-service.sh

# Copy the entrypoint script into the Docker image
COPY ./docker/entrypoint.sh /app/dlc-solidity/entrypoint.sh
RUN chmod +x /app/dlc-solidity/entrypoint.sh

COPY ./docker/scripts/deploy-all.js /app/dlc-solidity/docker/scripts/deploy-all.js

ENTRYPOINT [ "/app/dlc-solidity/entrypoint.sh" ]
