import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchPublicCourse } from '@/lib/course-share';

type Params = Promise<{ shareToken: string }>;

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { shareToken } = await params;
  const course = await fetchPublicCourse(shareToken);
  if (!course) return { title: 'Date Navi' };

  return {
    title: `${course.title} · Date Navi`,
    description: course.summary || 'A date course shared from Date Navi.',
  };
}

export default async function CourseSharePage({ params }: { params: Params }) {
  const { shareToken } = await params;
  const course = await fetchPublicCourse(shareToken);
  if (!course) notFound();

  return (
    <main
      style={{
        minHeight: '100dvh',
        background: 'linear-gradient(160deg, #FFF1F6 0%, #FFF9FC 60%)',
        padding: '48px 24px 64px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Segoe UI", sans-serif',
        color: '#3A2E2E',
      }}
    >
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div style={{ color: '#F26B7A', fontSize: 13, fontWeight: 800, letterSpacing: 2 }}>
          DATE NAVI
        </div>
        <h1 style={{ margin: '12px 0 8px', fontSize: 32, lineHeight: 1.2 }}>{course.title}</h1>
        {course.summary && <p style={{ margin: 0, color: '#8A7F76', fontSize: 16, lineHeight: 1.6 }}>{course.summary}</p>}

        <section
          aria-label="Course steps"
          style={{
            marginTop: 28,
            background: '#fff',
            border: '1px solid #F2E0DC',
            borderRadius: 22,
            padding: 20,
          }}
        >
          {course.steps.map((step, index) => (
            <div key={`${step.label}-${index}`} style={{ padding: '14px 0', borderBottom: index === course.steps.length - 1 ? 0 : '1px solid #F2E7DC' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                <span style={{ color: '#F26B7A', fontWeight: 800 }}>{index + 1}</span>
                <strong style={{ fontSize: 17 }}>{step.label}</strong>
              </div>
              {step.place_name && <div style={{ margin: '6px 0 0 28px', color: '#3A2E2E' }}>{step.place_name}</div>}
              {step.desc && <div style={{ margin: '4px 0 0 28px', color: '#8A7F76', fontSize: 14 }}>{step.desc}</div>}
            </div>
          ))}
        </section>

        {(course.estimated_time || course.estimated_budget) && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
            {[course.estimated_time, course.estimated_budget].filter(Boolean).map((item) => (
              <span key={item} style={{ background: '#FFEEF0', borderRadius: 999, padding: '7px 12px', color: '#C24B57', fontSize: 14 }}>
                {item}
              </span>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
