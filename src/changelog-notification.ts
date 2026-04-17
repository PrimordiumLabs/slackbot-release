import type {Block, HeaderBlock, SectionBlock} from '@slack/types'
import type {OauthV2AccessResponse} from '@slack/web-api/dist/response'
import axios from 'axios'
import {markdownToBlocks} from '@instantish/mack'

interface Repository {
  repo: string
  owner: string
}

interface Release {
  html_url: string
  name: string
  body: string
}

interface ChangelogParameters {
  slackWebhookUrl: string
  release: Release
  repo: Repository
}

const SMALL_BOAT_EMOJIS = ['⛵', '🛶', '🚤']
const BIG_BOAT_EMOJIS = ['⛴️', '🚢', '🛳️']

function chooseReleaseEmoji(releaseBody: string): string {
  const lineCount = releaseBody.split('\n').length
  const pullRequestCount = (releaseBody.match(/\/pull\/\d+/g) ?? []).length
  const isBigRelease =
    releaseBody.length >= 1800 || lineCount >= 30 || pullRequestCount >= 10
  const emojiPool = isBigRelease ? BIG_BOAT_EMOJIS : SMALL_BOAT_EMOJIS

  return emojiPool[Math.floor(Math.random() * emojiPool.length)]
}

function linkGithubMentions(markdown: string): string {
  return markdown.replace(
    /(^|[\s(,.:;!?])@([a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38})\b/gi,
    (match, prefix: string, username: string) => {
      if (prefix === '[') {
        return match
      }

      return `${prefix}[@${username}](https://github.com/${username})`
    }
  )
}

function replacePullRequestUrls(markdown: string): string {
  return markdown.replace(
    /<?(https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/(\d+))>?/g,
    (match: string, url: string, pullRequestNumber: string) => {
      if (match.startsWith('[')) {
        return match
      }

      return `[#${pullRequestNumber}](${url})`
    }
  )
}

function removeFullChangelogLine(markdown: string): string {
  return markdown
    .split('\n')
    .filter(line => !/\*\*Full Changelog\*\*/i.test(line))
    .join('\n')
}

function formatReleaseBody(markdown: string): string {
  return linkGithubMentions(
    replacePullRequestUrls(removeFullChangelogLine(markdown))
  )
}

export async function notifyChangelog({
  slackWebhookUrl,
  release,
  repo
}: ChangelogParameters): Promise<OauthV2AccessResponse> {
  const formattedReleaseBody = formatReleaseBody(release.body ?? '')
  const releaseEmoji = chooseReleaseEmoji(formattedReleaseBody)
  const introBlock: HeaderBlock = {
    type: 'header',
    text: {
      type: 'plain_text',
      text: `${releaseEmoji} ${release.name}`
    }
  }
  const linkBlock: SectionBlock = {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `<${release.html_url}|Release details>`
    }
  }

  const bodyBlocks: Block[] = await markdownToBlocks(formattedReleaseBody)

  return await axios.post(slackWebhookUrl, {
    text: `${release.name} has been released in ${repo.owner}/${repo.repo}`,
    blocks: [introBlock, ...bodyBlocks, linkBlock]
  })
}
