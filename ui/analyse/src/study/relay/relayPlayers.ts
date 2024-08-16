/// <reference types="../../../../bits/types/tablesort" />
import { Redraw, VNode, looseH as h, onInsert } from 'common/snabbdom';
import * as xhr from 'common/xhr';
import { spinnerVdom as spinner } from 'common/spinner';
import { RoundId, TourId } from './interfaces';
import { playerFed } from '../playerBars';
import { userTitle } from 'common/userLink';
import { ChapterId, Federation, Federations, FideId, StudyPlayerFromServer } from '../interfaces';
import tablesort from 'tablesort';
import extendTablesortNumber from 'common/tablesortNumber';
import { defined } from 'common';
import { Attrs, Hooks } from 'snabbdom';

type RelayPlayerId = FideId | string;

interface RelayPlayer extends StudyPlayerFromServer {
  id: RelayPlayerId; // fide ID or full name
  score: number;
  played: number;
  ratingDiff?: number;
}

interface RelayPlayerGame {
  id: ChapterId;
  round: RoundId;
  opponent: RelayPlayer;
  color: Color;
  outcome?: Outcome;
}

interface RelayPlayerWithGames extends RelayPlayer {
  games: RelayPlayerGame[];
}

export default class RelayPlayers {
  loading = false;
  players?: RelayPlayer[];

  constructor(
    private readonly tourId: TourId,
    readonly showScores: boolean,
    readonly isEmbed: boolean,
    private readonly federations: () => Federations | undefined,
    private readonly redraw: Redraw,
  ) {}

  loadFromXhr = async (onInsert?: boolean) => {
    if (this.players && !onInsert) {
      this.loading = true;
      this.redraw();
    }
    this.players = await xhr.json(`/broadcast/${this.tourId}/players`);
    this.redraw();
  };

  playerXhrUrl = (p: RelayPlayerId) => `/broadcast/${this.tourId}/players/${p}`;

  expandFederation = (p: RelayPlayer): Federation | undefined =>
    p.fed
      ? {
          id: p.fed,
          name: this.federations()?.[p.fed] || p.fed,
        }
      : undefined;

  playerPowerTipHook = (id: RelayPlayerId | undefined): Hooks => (id ? playerPowerTipHook(this, id) : {});
}

export const playersView = (ctrl: RelayPlayers): VNode =>
  h(
    'div.relay-tour__players',
    {
      class: { loading: ctrl.loading, nodata: !ctrl.players },
      hook: {
        insert: () => ctrl.loadFromXhr(true),
      },
    },
    ctrl.players ? renderPlayers(ctrl, ctrl.players) : [spinner()],
  );

const renderPlayers = (ctrl: RelayPlayers, players: RelayPlayer[]): VNode => {
  const withRating = !!players.find(p => p.rating);
  const defaultSort = { attrs: { 'data-sort-default': 1 } };
  return h(
    'table.relay-tour__players.slist.slist-invert.slist-pad',
    {
      hook: onInsert(tableAugment),
    },
    [
      h(
        'thead',
        h('tr', [
          h('th', 'Player'),
          withRating ? h('th', defaultSort, 'Elo') : undefined,
          ctrl.showScores && h('th', 'Score'),
          h('th', 'Games'),
        ]),
      ),
      h(
        'tbody',
        players.map(player =>
          h('tr', [
            h(
              'th',
              h(
                player.fideId ? 'a' : 'span',
                {
                  attrs: playerLinkAttrs(player.fideId, ctrl.isEmbed),
                  hook: ctrl.playerPowerTipHook(player.id),
                },
                [playerFed(ctrl.expandFederation(player)), userTitle(player), player.name],
              ),
            ),
            h('td', withRating && player.rating ? [`${player.rating}`, ratingDiff(player)] : undefined),
            ctrl.showScores && h('td', `${player.score}`),
            h('td', `${player.played}`),
          ]),
        ),
      ),
    ],
  );
};

export const playerLinkAttrs = (fideId: FideId | undefined, isEmbed: boolean): Attrs =>
  fideId
    ? {
        href: `/fide/${fideId}/redirect`,
        target: isEmbed ? '_blank' : '',
      }
    : {};

import { init as initSnabbdom, attributesModule } from 'snabbdom';
import { Outcome } from 'chessops';
const playerTipId = 'tour-player-tip';

export const playerPowerTipHook = (ctrl: RelayPlayers, id: RelayPlayerId): Hooks => ({
  insert(vnode) {
    $(vnode.elm as HTMLElement).powerTip({
      closeDelay: 200,
      popupId: playerTipId,
      preRender() {
        xhr.json(ctrl.playerXhrUrl(id)).then((p: RelayPlayerWithGames) => {
          const vdom = renderPlayerWithGames(ctrl, p);
          const el = document.getElementById(playerTipId) as HTMLElement;
          initSnabbdom([attributesModule])(el, h(`div#${playerTipId}`, vdom));
        });
      },
    });
  },
  destroy(vnode) {
    $.powerTip.hide(vnode.elm as HTMLElement, true);
    $.powerTip.destroy(vnode.elm as HTMLElement);
  },
});

const renderPlayerWithGames = (ctrl: RelayPlayers, p: RelayPlayerWithGames): VNode =>
  h('div.tpp', [
    h('div.tpp__player', [
      h('a.tpp__player__name', { attrs: playerLinkAttrs(p.fideId, ctrl.isEmbed) }, [userTitle(p), p.name]),
      h('div.tpp__player__info', [
        h('div', [playerFed(ctrl.expandFederation(p)), ...(p.rating ? [`${p.rating}`, ratingDiff(p)] : [])]),
        h('div', [p.score, ' / ', p.played]),
      ]),
    ]),
    h(
      'div.tpp__games',
      h(
        'table',
        h(
          'tbody',
          p.games.map((game, i) => {
            const op = game.opponent;
            return h(
              'tr',
              {
                hook: onInsert(el =>
                  el.addEventListener('click', (e: Event) => {
                    let tr = e.target as HTMLLinkElement;
                    while (tr && tr.tagName !== 'TR') tr = tr.parentNode as HTMLLinkElement;
                    const href = tr.querySelector('a')?.href;
                    if (href) location.href = href;
                  }),
                ),
              },
              [
                h('td', `${i + 1}`),
                h(
                  'td',
                  h('a', { attrs: { href: `/broadcast/-/-/${game.round}/${game.id}` } }, [
                    playerFed(ctrl.expandFederation(op)),
                    userTitle(op),
                    op.name,
                  ]),
                ),
                h('td', op.rating?.toString()),
                h('td.is.color-icon.' + game.color),
                h(
                  'td.tpp__games__status',
                  game.outcome
                    ? game.outcome.winner
                      ? game.outcome.winner == game.color
                        ? h('good', '1')
                        : h('bad', '0')
                      : h('span', '½')
                    : '*',
                ),
              ],
            );
          }),
        ),
      ),
    ),
  ]);

const ratingDiff = (p: RelayPlayer) => {
  const rd = p.ratingDiff;
  return !defined(rd)
    ? undefined
    : rd > 0
    ? h('good.rp', '+' + rd)
    : rd < 0
    ? h('bad.rp', '−' + -rd)
    : h('span', ' ==');
};

const tableAugment = (el: HTMLTableElement) => {
  extendTablesortNumber();
  $(el).each(function (this: HTMLElement) {
    tablesort(this, {
      descending: true,
    });
  });
};
