import { createRouter, createWebHistory } from 'vue-router'

import DashboardView from "../views/DashboardView.vue";
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

const router = createRouter({
    history: createWebHistory(),

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
            component: LessonView
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
    ]
})
export default router