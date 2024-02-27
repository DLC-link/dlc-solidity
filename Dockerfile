FROM node:20 AS dlc-solidity-build

COPY ./contracts /app/dlc-solidity/contracts
COPY ./scripts /app/dlc-solidity/scripts
COPY ./test /app/dlc-solidity/test
COPY ./package.json /app/dlc-solidity/package.json
# COPY ./package-lock.json /app/dlc-solidity/package-lock.json
COPY ./docker/hardhat.config.docker.js /app/dlc-solidity/hardhat.config.js

WORKDIR /app/dlc-solidity

RUN npm install

# copy entrypoint
# todo

FROM node:20-alpine

COPY --from=dlc-solidity-build /app/dlc-solidity /app/dlc-solidity

WORKDIR /app/dlc-solidity

ENTRYPOINT [ "npx", "hardhat", "node" ]
