import { createRouter, createWebHistory } from 'vue-router'

import { titleForRoute } from './titles'

import DashboardView from "../views/DashboardView.vue";
import NotFoundView from "../views/NotFoundView.vue";
import PracticeView from "../views/PracticeView.vue";
import ClozeView from "../views/ClozeView.vue";
import ListenGuessView from "../views/ListenGuessView.vue";
import MatchingView from "../views/MatchingView.vue";
import QuizView from "../views/QuizView.vue";
import LessonsView from "../views/LessonsView.vue"
import LessonView from "../views/LessonView.vue"
import CourseView from "../views/CourseView.vue";
import ListenRepeat from '../views/ListenRepeatView.vue';
import HardWordsView from '../views/HardWordsView.vue'
import SpeakingPracticeView from '../views/SpeakingPracticeView.vue'
import ReviewView from  '../views/ReviewView.vue'
import SessionView from '../views/SessionView.vue'
import ProfileView from '../views/ProfileView.vue'
import SkillsView from '../views/SkillsView.vue'
import GrammarView from '../views/GrammarView.vue'
import ReadingView from '../views/ReadingView.vue'
import WritingView from '../views/WritingView.vue'
import ListeningView from '../views/ListeningView.vue'
import GuidedSpeakingView from '../views/GuidedSpeakingView.vue'
import AISettingsView from '../views/AISettingsView.vue'
import ConversationView from '../views/ConversationView.vue'
import RealLifeView from '../views/RealLifeView.vue'
import CareerView from '../views/CareerView.vue'
import JourneyView from '../views/JourneyView.vue'

/*
 * Lists load asynchronously, so on Back the saved position may be taller than
 * the page is at that instant (the browser would clamp it to the top). Wait
 * briefly for the content to exist before restoring.
 */
function whenTallEnough(position: { left?: number; top?: number }): Promise<{ left?: number; top?: number }> {
    return new Promise(resolve => {
        const started = Date.now()

        const attempt = () => {
            const needed = (position.top ?? 0) + window.innerHeight

            if (document.documentElement.scrollHeight >= needed || Date.now() - started > 2000) resolve(position)
            else requestAnimationFrame(attempt)
        }

        attempt()
    })
}

const router = createRouter({
    history: createWebHistory(),

    /*
     * Back/forward restores the old position; a new page starts at the top;
     * a query-only change on the same page (lesson ?w=, scenario step) keeps
     * the reader where they are.
     */
    scrollBehavior(to, from, savedPosition) {
        if (savedPosition) return whenTallEnough(savedPosition)
        if (to.path === from.path) return false

        return { top: 0 }
    },

    routes: [
        {
            path: '/',
            name: 'dashboard',
            component: DashboardView,
        },
        {
            path: '/courses/:courseId',
            name: 'course',
            component: CourseView
        },
        {
            path: '/courses/:courseId/lessons/:lessonId',
            name: 'lesson',
            component: LessonView,
            meta: { focusLayout: true }
        },
        {
            path: '/lessons',
            name: 'lessons',
            component: LessonsView,
        },
        {
            path: '/learn',
            redirect: '/lessons',
        },
        {
            path: '/practice',
            name: 'practice',
            component: PracticeView,
            meta: { focusLayout: true },
        },
        {
            path: '/quiz',
            name: 'quiz',
            component: QuizView
        },
        {
            path: '/cloze',
            name: 'cloze',
            component: ClozeView
        },
        {
            path: '/listen-guess',
            name: 'listen-guess',
            component: ListenGuessView
        },
        {
            path: '/matching',
            name: 'matching',
            component: MatchingView
        },
        {
            path: '/listen-repeat',
            name: 'listen-repeat',
            component: ListenRepeat
        },
        {
            path: '/hard-words',
            name: 'hard-words',
            component: HardWordsView,
        },
        {
            path: '/speaking-practice',
            name: 'speaking-practice',
            component: SpeakingPracticeView,
        },
        {
            path: '/review',
            name: 'review',
            component: ReviewView,
        },
        {
            path: '/session',
            name: 'session',
            component: SessionView,
        },
        {
            path: '/profile',
            name: 'profile',
            component: ProfileView,
        },
        {
            path: '/skills',
            name: 'skills',
            component: SkillsView,
        },
        {
            path: '/grammar',
            name: 'grammar',
            component: GrammarView,
        },
        {
            path: '/reading',
            name: 'reading',
            component: ReadingView,
        },
        {
            path: '/writing',
            name: 'writing',
            component: WritingView,
        },
        {
            path: '/listening',
            name: 'listening',
            component: ListeningView,
        },
        {
            path: '/guided-speaking',
            name: 'guided-speaking',
            component: GuidedSpeakingView,
        },
        {
            path: '/ai-settings',
            name: 'ai-settings',
            component: AISettingsView,
        },
        {
            path: '/conversation',
            name: 'conversation',
            component: ConversationView,
        },
        {
            path: '/real-life',
            name: 'real-life',
            component: RealLifeView,
        },
        {
            path: '/career-english',
            name: 'career-english',
            component: CareerView,
        },
        {
            path: '/daily-journey',
            name: 'daily-journey',
            component: JourneyView,
        },
        {
            path: '/:pathMatch(.*)*',
            name: 'not-found',
            component: NotFoundView,
        },
    ]
})
router.afterEach(to => {
    document.title = titleForRoute(to.name)
})

export default router