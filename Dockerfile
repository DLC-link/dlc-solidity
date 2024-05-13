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
# Copy the entrypoint script into the Docker image
COPY ./docker/entrypoint.sh /app/dlc-solidity/entrypoint.sh
RUN chmod +x /app/dlc-solidity/entrypoint.sh

FROM node:20-alpine

COPY --from=dlc-solidity-build /app/dlc-solidity /app/dlc-solidity

WORKDIR /app/dlc-solidity


ENTRYPOINT [ "/app/dlc-solidity/entrypoint.sh" ]
