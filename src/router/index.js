import { createRouter, createWebHistory } from 'vue-router';
import DashboardView from "../views/DashboardView.vue";
import PracticeView from "../views/PracticeView.vue";
import ClozeView from "../views/ClozeView.vue";
import ListenGuessView from "../views/ListenGuessView.vue";
import MatchingView from "../views/MatchingView.vue";
import QuizView from "../views/QuizView.vue";
import LessonsView from "../views/LessonsView.vue";
import LessonView from "../views/LessonView.vue";
import CourseView from "../views/CourseView.vue";
import ListenRepeat from '../views/ListenRepeatView.vue';
import HardWordsView from '../views/HardWordsView.vue';
import SpeakingPracticeView from '../views/SpeakingPracticeView.vue';
import ReviewView from '../views/ReviewView.vue';
import SessionView from '../views/SessionView.vue';
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
    ]
});
export default router;
