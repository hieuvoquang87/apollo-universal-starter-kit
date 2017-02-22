import React from 'react'
import ReactDOM from 'react-dom/server'
import { createBatchingNetworkInterface } from 'apollo-client'
import { ApolloProvider, getDataFromTree } from 'react-apollo'
import { match, RouterContext } from 'react-router'
import { StyleSheetServer } from 'aphrodite'
import { reset, startBuffering } from 'aphrodite/lib/inject'
import fs from 'fs'
import path from 'path'

import createApolloClient from '../../apollo_client'
import createReduxStore from '../../redux_store'
import Html from '../../ui/components/html'
import routes from '../../routes'
import log from '../../log'
import { app as settings } from '../../../package.json'

const port = process.env.PORT || settings.apiPort;

const apiUrl = `http://localhost:${port}/graphql`;

var assetMap;

export default (req, res) => {
  match({ routes, location: req.originalUrl }, (error, redirectLocation, renderProps) => {
    if (redirectLocation) {
      res.redirect(redirectLocation.pathname + redirectLocation.search);
    } else if (error) {
      log.error('ROUTER ERROR:', error);
      res.status(500);
    } else if (__SSR__ && renderProps) {
      const client = createApolloClient(createBatchingNetworkInterface({
        uri: apiUrl,
        opts: {
          credentials: "same-origin",
          headers: req.headers,
        },
        batchInterval: 20,
      }));

      let initialState = {};
      const store = createReduxStore(initialState, client);

      const component = (
        <ApolloProvider store={store} client={client}>
          <RouterContext {...renderProps} />
        </ApolloProvider>
      );

      // Work around Aphrodite not supporting async rendering
      // See: https://github.com/Khan/aphrodite/pull/132 for discussion
      reset();
      startBuffering();
      getDataFromTree(component).then(() => {
        // Work around Aphrodite not supporting async rendering
        reset();

        res.status(200);

        const { html, css } = StyleSheetServer.renderStatic(() => ReactDOM.renderToString(component));

        if (__DEV__ || !assetMap) {
          assetMap = JSON.parse(fs.readFileSync(path.join(settings.frontendBuildDir, 'assets.json')));
        }

        const apolloState = Object.assign({}, client.store.getState());

        // // Temporary workaround for bug in AC@0.5.0: https://github.com/apollostack/apollo-client/issues/845
        delete apolloState.apollo.queries;
        delete apolloState.apollo.mutations;

        const page = <Html content={html} state={apolloState} assetMap={assetMap} aphroditeCss={css.content}/>;
        res.send(`<!doctype html>\n${ReactDOM.renderToStaticMarkup(page)}`);
        res.end();
      }).catch(e => log.error('RENDERING ERROR:', e));
    } else if (!__SSR__ && renderProps) {
      if (__DEV__ || !assetMap) {
        assetMap = JSON.parse(fs.readFileSync(path.join(settings.frontendBuildDir, 'assets.json')));
      }
      const page = <Html content="" state={({})} assetMap={assetMap} aphroditeCss="" />;
      res.send(`<!doctype html>\n${ReactDOM.renderToStaticMarkup(page)}`);
      res.end();
    } else {
      res.status(404).send('Not found');
    }
  });
};