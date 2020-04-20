import {
  getQuestionnaireById,
  getNomenclatureById,
  getDataSurveyUnitById,
  getCommentSurveyUnitById,
  getListRequiredNomenclature,
} from 'utils/api';
import { KEYCLOAK } from 'utils/constants';
import surveyUnitIdbService from 'utils/indexedbb/services/surveyUnit-idb-service';
import D from 'i18n';

export const initialize = ({
  configuration,
  idQuestionnaire,
  idSurveyUnit,
  setWaitingMessage,
  setQuestionnaire,
  setSurveyUnit,
}) => async () => {
  const { standalone, urlQueenApi, authenticationMode } = configuration;

  // clean cache and database
  if (standalone) {
    setWaitingMessage(D.waitingCleaning);
    await surveyUnitIdbService.deleteAll();
    await caches.delete('queen-questionnaire');
  }

  setWaitingMessage(D.waitingAuthentication);
  let token = null;
  if (authenticationMode === KEYCLOAK) {
    // TODO : get/update TOKEN
  }
  /**
   * Get questionnaire
   *    standalone mode : get from the API (always online)
   *    embedded mode   : get from the API or service-worker
   */
  setWaitingMessage(D.waitingQuestionnaire);
  const response = await getQuestionnaireById(urlQueenApi, token)(idQuestionnaire);
  const questionnaire = await response.data;
  // set questionnaire to orchestrator
  if (questionnaire) {
    setQuestionnaire(questionnaire);
  } else {
    throw new Error(D.questionnaireNotFound);
  }

  /**
   * Get resources for questionnaire
   * (waiting for spec)
   */
  if (standalone) {
    setWaitingMessage(D.waitingResources);
    const resourcesResponse = await getListRequiredNomenclature(
      urlQueenApi,
      token
    )(idQuestionnaire);
    const resources = await resourcesResponse.data;
    await Promise.all(
      resources.map(async resource => {
        const { id } = resource;
        await getNomenclatureById(urlQueenApi, token)(id);
      })
    );
  }
  /**
   * Get survey-unit's data
   *    standalone mode : get data from API, then from database
   *    embedded mode   : get data from database
   */
  setWaitingMessage(D.waitingDataSU);
  if (standalone) {
    const dataResponse = await getDataSurveyUnitById(urlQueenApi, token)(idSurveyUnit);
    const surveyUnitData = await dataResponse.data;
    const commentResponse = await getCommentSurveyUnitById(urlQueenApi, token)(idSurveyUnit);
    const surveyUnitComment = await commentResponse.data;
    await surveyUnitIdbService.addOrUpdateSU({
      idSU: idSurveyUnit,
      data: surveyUnitData,
      comment: surveyUnitComment,
    });
  }
  const surveyUnit = await surveyUnitIdbService.getByIdSU(idSurveyUnit);
  if (surveyUnit) {
    // set survey unit data to orchestrator
    setSurveyUnit(surveyUnit);
  } else {
    throw new Error(D.surveyUnitNotFound);
  }
};