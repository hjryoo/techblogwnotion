const { Client } = require("@notionhq/client");
const Parser = require("rss-parser");

// 1. 환경변수 및 설정
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

const parser = new Parser({
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
    Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
  },
});

const RSS_LIST = [
  "https://techblog.woowahan.com/feed/",
  "https://d2.naver.com/d2.xml",
  "https://toss.tech/rss.xml",
  "https://feeds.feedburner.com/geeknews-feed",
];

async function main() {
  console.log("🔄 RSS 가져오기 시작...");

  // 노션 클라이언트가 제대로 로드되었는지 확인
  if (!notion.databases || typeof notion.databases.query !== "function") {
    console.error("❌ 오류: @notionhq/client 라이브러리가 올바르지 않습니다.");
    console.error("👉 'npm install @notionhq/client@latest --legacy-peer-deps' 명령어를 실행해보세요.");
    return;
  }

  for (const url of RSS_LIST) {
    try {
      // 타임아웃 방지를 위해 약간의 딜레이 추가 (선택사항)
      const feed = await parser.parseURL(url);
      console.log(`\n📡 [${feed.title}] 처리 중...`);

      for (const item of feed.items) {
        if (!item.title || !item.link) continue;

        // 2. 중복 검사
        const exists = await notion.databases.query({
          database_id: DATABASE_ID,
          filter: {
            property: "Name", // ⚠️ 본인 노션 DB의 제목 컬럼명이 'Name'인지 확인하세요! (Title인 경우도 있음)
            title: {
              equals: item.title,
            },
          },
        });

        if (exists.results.length > 0) {
          process.stdout.write("."); // 이미 있으면 점 하나 찍고 넘어감
          continue;
        }

        // 3. 새 글 추가
        await notion.pages.create({
          parent: { database_id: DATABASE_ID },
          properties: {
            Name: { // ⚠️ 노션 DB 제목 컬럼명 (Name 또는 Title)
              title: [{ text: { content: item.title } }],
            },
            Date: {
              date: { start: new Date(item.pubDate || new Date()).toISOString() },
            },
            Slug: {
              rich_text: [
                {
                  text: {
                    content: item.title
                      .replace(/[^a-z0-9]/gi, "-")
                      .toLowerCase()
                      .slice(0, 50), // 너무 길면 자름
                  },
                },
              ],
            },
            Type: {
              select: { name: "Post" },
            },
            Status: {
              select: { name: "Published" },
            },
            Category: {
              select: { name: "RSS Feed" },
            },
            Tags: {
              multi_select: [{ name: "Tech News" }],
            },
          },
          children: [
            {
              object: "block",
              type: "paragraph",
              paragraph: {
                rich_text: [
                  { text: { content: "Original Link: " } },
                  {
                    text: { content: item.link, link: { url: item.link } },
                  },
                ],
              },
            },
            {
              object: "block",
              type: "embed",
              embed: { url: item.link },
            },
          ],
        });
        console.log(` ✅ 추가됨: ${item.title}`);
      }
    } catch (error) {
      console.error(` ❌ 실패 (${url}): ${error.message}`);
    }
  }
  console.log("\n✨ 모든 작업 완료!");
}

main();