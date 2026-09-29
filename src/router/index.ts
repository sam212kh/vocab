import { createRouter, createWebHistory } from 'vue-router'

import DashboardView from "../views/DashboardView.vue";
import LearnView from "../views/LearnView.vue";
import PracticeView from "../views/PracticeView.vue";
import QuizView from "../views/QuizView.vue";
import LessonsView from "../views/LessonsView.vue"
import LessonView from "../views/LessonView.vue"
import CourseView from "../views/CourseView.vue";
import ListenRepeat from '../views/ListenRepeatView.vue';
import HardWordsView from '../views/HardWordsView.vue'
import SpeakingPracticeView from '../views/SpeakingPracticeView.vue'
import ReviewView from  '../views/ReviewView.vue'

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
            name: 'learn',
            component: LearnView,
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
    ]
})
export default router