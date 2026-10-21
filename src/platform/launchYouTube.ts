import { launchTvApp, TV_APPS } from './launchTvApp';

export const YOUTUBE_APP_ID = TV_APPS.youtube.ids[0];
export const launchYouTube = (runtime: unknown) => launchTvApp(runtime, 'youtube');
